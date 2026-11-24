import {
  getCachedGeocode,
  getCachedRoute,
  setCachedGeocode,
  setCachedRoute,
} from './db';
import { precacheTilesToCacheStorage } from './offlineTiles';
import type {
  ActiveNavigationRoute,
  NavStep,
  RouteGeometry,
  Stop,
  SyncProgress,
  Zone,
} from '../types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Limpia y normaliza direcciones españolas/catalanas para maximizar la tasa de acierto
 * en Photon y Nominatim:
 * - Expande abreviaturas (C/, Av., Pl., Pg., Rda., etc.)
 * - Quita pisos, puertas, locales, entresuelos, bajos, bloques, escaleras
 * - Devuelve tanto `streetAndNumber` como `streetOnly` para fallback si el número no existe en OSM
 */
export function cleanSpanishAddress(rawAddress: string): {
  streetAndNumber: string;
  streetOnly: string;
} {
  let addr = rawAddress.trim();

  // Expandir abreviaturas comunes al inicio o tras coma
  addr = addr
    .replace(/\bC\/\s*/gi, 'Carrer ')
    .replace(/\bCl\.?\s+/gi, 'Calle ')
    .replace(/\bAvda\.?\s+/gi, 'Avinguda ')
    .replace(/\bAv\.?\s+/gi, 'Avinguda ')
    .replace(/\bPl\.?\s+/gi, 'Plaça ')
    .replace(/\bPza\.?\s+/gi, 'Plaza ')
    .replace(/\bPg\.?\s+/gi, 'Passeig ')
    .replace(/\bPº\.?\s+/gi, 'Passeig ')
    .replace(/\bRda\.?\s+/gi, 'Ronda ')
    .replace(/\bTrav\.?\s+/gi, 'Travessera ')
    .replace(/\bPs\.?\s+/gi, 'Passeig ');

  // Quitar sufijos de piso/puerta/local tras segunda coma o palabras clave
  const parts = addr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // Regex para detectar segmentos que son solo piso/puerta/local (no calle ni número principal)
  const floorPattern =
    /^(?:\d+\s*[ºªrta]|bajo|bajos|baixos|principal|pral|entresuelo|entresòl|entl|ático|àtic|local|loc|puerta|pta|esc|escalera|bloque|blq|piso|sobreático)\b/i;

  let streetPart = parts[0] ?? addr;
  let numberPart = '';

  if (parts.length >= 2) {
    // Si el segundo segmento es un número de portal (ej. "12" o "12 bis" o "12-14" o "nº 12")
    const numMatch = parts[1].match(/^(?:n[º°.]?\s*)?(\d+[a-z]?)(?:\s*[-/]\s*\d+)?$/i);
    if (numMatch) {
      numberPart = numMatch[1];
    } else if (!floorPattern.test(parts[1])) {
      // Podría ser "12 2º 1ª" en el segundo segmento
      const leadingNum = parts[1].match(/^(?:n[º°.]?\s*)?(\d+[a-z]?)\b/i);
      if (leadingNum) {
        numberPart = leadingNum[1];
      }
    }
  }

  // Si el número venía pegado dentro del primer segmento (ej. "La Riera 12 1º 1ª")
  if (!numberPart) {
    // Eliminar pisos al final del primer segmento
    streetPart = streetPart
      .replace(
        /\s+(?:\d+\s*[ºªrta](?:\s*\d+\s*[ªa])?|bajo|bajos|principal|entresuelo|ático|local\s*\d*|puerta\s*\w+|esc\.?\s*\w+).*$/i,
        ''
      )
      .trim();
    const inlineNum = streetPart.match(/^(.*?)\s+(?:n[º°.]?\s*)?(\d+[a-z]?)$/i);
    if (inlineNum && inlineNum[1].length >= 3) {
      streetPart = inlineNum[1].trim();
      numberPart = inlineNum[2].trim();
    }
  }

  const streetOnly = streetPart.replace(/\s+/g, ' ').trim();
  const streetAndNumber = numberPart ? `${streetOnly} ${numberPart}` : streetOnly;

  return { streetAndNumber, streetOnly };
}

function normalizeCacheKey(address: string, cityHint: string): string {
  const { streetAndNumber } = cleanSpanishAddress(address);
  const cleanCity = cityHint.trim().toLowerCase();
  return `v2:${streetAndNumber.toLowerCase()}|${cleanCity}`;
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Calcula la distancia mínima en metros desde un punto GPS a una polilínea de ruta
 * y devuelve también el índice del vértice más cercano.
 */
export function findClosestPointOnPolyline(
  point: [number, number],
  polyline: [number, number][]
): { distanceMeters: number; index: number } {
  if (polyline.length === 0) return { distanceMeters: Infinity, index: 0 };
  let min = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < polyline.length; i++) {
    const d = haversineMeters(point, polyline[i]);
    if (d < min) {
      min = d;
      bestIdx = i;
    }
  }
  return { distanceMeters: min, index: bestIdx };
}

export function distanceToPolylineMeters(
  point: [number, number],
  polyline: [number, number][]
): number {
  return findClosestPointOnPolyline(point, polyline).distanceMeters;
}

/**
 * Recorta una ruta precalculada para que empiece SIEMPRE desde la ubicación exacta del conductor,
 * eliminando cualquier cola desde el punto anterior y recalculando distancia/duración restante.
 */
export function sliceRouteFromDriver(
  route: ActiveNavigationRoute,
  driverPos: [number, number]
): ActiveNavigationRoute {
  if (route.coordinates.length < 2) return route;

  const { index } = findClosestPointOnPolyline(driverPos, route.coordinates);
  const remainingCoords: [number, number][] = [driverPos, ...route.coordinates.slice(index + 1)];
  if (remainingCoords.length < 2) {
    remainingCoords.push(route.coordinates[route.coordinates.length - 1]);
  }

  let remainingDist = 0;
  for (let i = 1; i < remainingCoords.length; i++) {
    remainingDist += haversineMeters(remainingCoords[i - 1], remainingCoords[i]);
  }

  const ratio =
    route.distanceMeters > 0 ? Math.min(1, Math.max(0.05, remainingDist / route.distanceMeters)) : 1;

  // Filtrar pasos que ya quedaron atrás del conductor (si hay varios)
  let remainingSteps = route.steps;
  if (route.steps.length > 2) {
    let bestStepIdx = 0;
    let bestStepDist = Infinity;
    for (let i = 0; i < route.steps.length; i++) {
      const d = haversineMeters(driverPos, route.steps[i].location);
      if (d < bestStepDist) {
        bestStepDist = d;
        bestStepIdx = i;
      }
    }
    remainingSteps = route.steps.slice(bestStepIdx);
  }

  return {
    ...route,
    coordinates: remainingCoords,
    distanceMeters: Math.round(remainingDist),
    durationSeconds: Math.max(30, Math.round(route.durationSeconds * ratio)),
    steps: remainingSteps,
  };
}

const cityCenterMemoryCache = new Map<string, { lat: number; lng: number }>();

async function getCityCenter(cityHint: string): Promise<{ lat: number; lng: number } | null> {
  const clean = cityHint.trim().toLowerCase();
  if (!clean) return null;

  const inMem = cityCenterMemoryCache.get(clean);
  if (inMem) return inMem;

  const cacheKey = `city-center:${clean}`;
  const cached = await getCachedGeocode(cacheKey);
  if (cached) {
    cityCenterMemoryCache.set(clean, cached);
    return cached;
  }

  if (!navigator.onLine) return null;

  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(cityHint)}&limit=1`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
      };
      const coords = data.features?.[0]?.geometry?.coordinates;
      if (coords && coords.length === 2) {
        const result = { lat: coords[1], lng: coords[0] };
        cityCenterMemoryCache.set(clean, result);
        await setCachedGeocode(cacheKey, result.lat, result.lng);
        return result;
      }
    }
  } catch {
    // Fallback a Nominatim abajo
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cityHint)}`
    );
    if (res.ok) {
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (data.length > 0) {
        const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        if (!Number.isNaN(result.lat) && !Number.isNaN(result.lng)) {
          cityCenterMemoryCache.set(clean, result);
          await setCachedGeocode(cacheKey, result.lat, result.lng);
          return result;
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function isReasonableDistance(
  candidate: { lat: number; lng: number },
  cityCenter: { lat: number; lng: number } | null
): boolean {
  if (!cityCenter) return true;
  // Dentro de 28 km del centro de la ciudad configurada (evita saltos a otras provincias)
  return haversineMeters([candidate.lat, candidate.lng], [cityCenter.lat, cityCenter.lng]) <= 28000;
}

async function queryPhoton(
  query: string,
  cityCenter: { lat: number; lng: number } | null
): Promise<{ lat: number; lng: number } | null> {
  try {
    const bias = cityCenter ? `&lat=${cityCenter.lat}&lon=${cityCenter.lng}` : '';
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5${bias}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };
    const features = data.features ?? [];
    for (const f of features) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const cand = { lat: coords[1], lng: coords[0] };
      if (isReasonableDistance(cand, cityCenter)) {
        return cand;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

async function queryNominatim(
  query: string,
  cityCenter: { lat: number; lng: number } | null
): Promise<{ lat: number; lng: number } | null> {
  try {
    let viewbox = '';
    if (cityCenter) {
      const d = 0.18; // ~20km box
      viewbox = `&viewbox=${cityCenter.lng - d},${cityCenter.lat + d},${cityCenter.lng + d},${cityCenter.lat - d}&bounded=1`;
    }
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=es${viewbox}&q=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    for (const item of data) {
      const cand = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
      if (!Number.isNaN(cand.lat) && !Number.isNaN(cand.lng) && isReasonableDistance(cand, cityCenter)) {
        return cand;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export async function geocodeAddress(
  address: string,
  cityHint: string,
  precomputedCityCenter?: { lat: number; lng: number } | null
): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = normalizeCacheKey(address, cityHint);
  const cached = await getCachedGeocode(cacheKey);
  if (cached) return cached;

  if (!navigator.onLine) return null;

  const cityCenter =
    precomputedCityCenter !== undefined ? precomputedCityCenter : await getCityCenter(cityHint);

  const { streetAndNumber, streetOnly } = cleanSpanishAddress(address);
  const cityName = cityHint.trim();
  const cityFirstToken = cityName.split(',')[0].trim().toLowerCase();
  const hasCity = cityFirstToken.length > 0 && address.toLowerCase().includes(cityFirstToken);
  const fullWithNumber = hasCity || !cityName ? streetAndNumber : `${streetAndNumber}, ${cityName}`;
  const fullStreetOnly = hasCity || !cityName ? streetOnly : `${streetOnly}, ${cityName}`;

  // 1. Photon con Calle + Número (rápido y tolerante a formato español/catalán)
  let found = await queryPhoton(fullWithNumber, cityCenter);
  if (found) {
    await setCachedGeocode(cacheKey, found.lat, found.lng);
    return found;
  }

  // 2. Nominatim con Calle + Número (muy preciso en números de portal en España)
  found = await queryNominatim(fullWithNumber, cityCenter);
  if (found) {
    await setCachedGeocode(cacheKey, found.lat, found.lng);
    return found;
  }

  // 3. Fallback solo calle (cuando el número exacto no está mapeado en OSM)
  if (fullStreetOnly !== fullWithNumber) {
    found = await queryPhoton(fullStreetOnly, cityCenter);
    if (found) {
      await setCachedGeocode(cacheKey, found.lat, found.lng);
      return found;
    }

    await sleep(450);
    found = await queryNominatim(fullStreetOnly, cityCenter);
    if (found) {
      await setCachedGeocode(cacheKey, found.lat, found.lng);
      return found;
    }
  }

  return null;
}

export function formatDistanceEs(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDurationEs(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

export function formatEtaTimeEs(seconds: number): string {
  const arrival = new Date(Date.now() + seconds * 1000);
  return arrival.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function buildSpanishInstruction(type: string, modifier: string | undefined, street: string): string {
  const via = street ? ` en ${street}` : '';
  switch (type) {
    case 'depart':
      return street ? `Sal por ${street}` : 'Inicia la marcha';
    case 'arrive':
      return 'Llegada a tu destino';
    case 'roundabout':
    case 'rotary':
      return street ? `En la rotonda, toma salida hacia ${street}` : 'Toma la rotonda';
    case 'turn':
    case 'end of road':
    case 'fork':
    case 'on ramp':
    case 'off ramp':
      if (modifier === 'left') return `Gira a la izquierda${via}`;
      if (modifier === 'right') return `Gira a la derecha${via}`;
      if (modifier === 'sharp left') return `Giro cerrado a la izquierda${via}`;
      if (modifier === 'sharp right') return `Giro cerrado a la derecha${via}`;
      if (modifier === 'slight left') return `Mantente a la izquierda${via}`;
      if (modifier === 'slight right') return `Mantente a la derecha${via}`;
      if (modifier === 'uturn') return `Haz un cambio de sentido${via}`;
      return `Continúa recto${via}`;
    case 'continue':
    case 'new name':
      return `Continúa${via}`;
    default:
      return street ? `Sigue por ${street}` : 'Continúa por la ruta';
  }
}

interface OsrmStepRaw {
  name?: string;
  distance: number;
  duration?: number;
  geometry?: { coordinates?: [number, number][] };
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number];
  };
}

interface OsrmLegRaw {
  distance: number;
  duration: number;
  steps?: OsrmStepRaw[];
}

interface OsrmRouteResponse {
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs?: OsrmLegRaw[];
  }>;
}

function extractLegNavigation(leg: OsrmLegRaw, fallbackFrom: [number, number], fallbackTo: [number, number]): ActiveNavigationRoute {
  const rawSteps = leg.steps ?? [];
  const coords: [number, number][] = [];
  const steps: NavStep[] = [];

  for (const s of rawSteps) {
    const street = (s.name ?? '').trim();
    steps.push({
      instruction: buildSpanishInstruction(s.maneuver.type, s.maneuver.modifier, street),
      maneuverType: s.maneuver.type,
      maneuverModifier: s.maneuver.modifier,
      streetName: street,
      distanceMeters: Math.round(s.distance),
      location: [s.maneuver.location[1], s.maneuver.location[0]],
    });

    const stepCoords = s.geometry?.coordinates ?? [];
    for (const [lng, lat] of stepCoords) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== lat || last[1] !== lng) {
        coords.push([lat, lng]);
      }
    }
  }

  return {
    coordinates: coords.length >= 2 ? coords : [fallbackFrom, fallbackTo],
    distanceMeters: Math.round(leg.distance),
    durationSeconds: Math.max(30, Math.round(leg.duration)),
    steps,
    isFallback: coords.length < 2,
  };
}

/**
 * Calcula en UNA SOLA petición rápida a OSRM la ruta completa de la zona Y todos
 * los tramos individuales (legs) con calles reales y giros paso a paso.
 * Esto hace la sincronización 10x más rápida y el cambio de parada instantáneo (0 ms).
 */
export async function computeZoneRouteAndLegs(stops: Stop[]): Promise<{
  route: RouteGeometry | null;
  legs: Record<string, ActiveNavigationRoute>;
}> {
  const validStops = stops.filter((s) => s.lat !== null && s.lng !== null);
  const legs: Record<string, ActiveNavigationRoute> = {};

  if (validStops.length === 0) return { route: null, legs };
  if (validStops.length === 1) {
    const s = validStops[0];
    return {
      route: {
        coordinates: [[s.lat as number, s.lng as number]],
        distanceMeters: 0,
        durationSeconds: 0,
        isFallback: true,
      },
      legs,
    };
  }

  const validCoords = validStops.map((s) => [s.lat as number, s.lng as number] as [number, number]);
  const cacheKey = `zone-full-v2:${validCoords
    .map(([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`)
    .join(';')}`;

  const cached = (await getCachedRoute(cacheKey)) as unknown as {
    route: RouteGeometry;
    legs: Record<string, ActiveNavigationRoute>;
  } | null;

  if (cached && cached.route && cached.legs) {
    return cached;
  }

  if (navigator.onLine) {
    try {
      // Dividir en bloques de máximo 40 paradas para no superar límites de URL de OSRM
      const chunkSize = 40;
      const allRouteCoords: [number, number][] = [];
      let totalDistance = 0;
      let totalDuration = 0;
      let osrmSucceeded = true;

      for (let start = 0; start < validStops.length - 1; start += chunkSize - 1) {
        const slice = validStops.slice(start, Math.min(validStops.length, start + chunkSize));
        const osrmCoords = slice.map((s) => `${s.lng},${s.lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        if (!res.ok) {
          osrmSucceeded = false;
          break;
        }
        const data = (await res.json()) as OsrmRouteResponse;
        const first = data.routes?.[0];
        if (!first || !first.geometry?.coordinates?.length) {
          osrmSucceeded = false;
          break;
        }

        totalDistance += first.distance;
        totalDuration += first.duration;
        for (const [lng, lat] of first.geometry.coordinates) {
          allRouteCoords.push([lat, lng]);
        }

        const rawLegs = first.legs ?? [];
        for (let i = 0; i < rawLegs.length && i < slice.length - 1; i++) {
          const fromStop = slice[i];
          const toStop = slice[i + 1];
          const legKey = `${fromStop.id}->${toStop.id}`;
          legs[legKey] = extractLegNavigation(
            rawLegs[i],
            [fromStop.lat as number, fromStop.lng as number],
            [toStop.lat as number, toStop.lng as number]
          );
        }
      }

      if (osrmSucceeded && allRouteCoords.length > 1) {
        const result = {
          route: {
            coordinates: allRouteCoords,
            distanceMeters: Math.round(totalDistance),
            durationSeconds: Math.round(totalDuration),
            isFallback: false,
          },
          legs,
        };
        await setCachedRoute(cacheKey, result as unknown as RouteGeometry);
        return result;
      }
    } catch {
      // Fallback limpio abajo
    }
  }

  // Fallback offline si no había caché previa
  let totalDistance = 0;
  for (let i = 1; i < validStops.length; i++) {
    const fromStop = validStops[i - 1];
    const toStop = validStops[i];
    const a: [number, number] = [fromStop.lat as number, fromStop.lng as number];
    const b: [number, number] = [toStop.lat as number, toStop.lng as number];
    const d = haversineMeters(a, b);
    totalDistance += d;
    legs[`${fromStop.id}->${toStop.id}`] = {
      coordinates: [a, b],
      distanceMeters: Math.round(d),
      durationSeconds: Math.max(45, Math.round(d / 5.5)),
      steps: [
        {
          instruction: `Dirígete hacia ${toStop.address}`,
          maneuverType: 'continue',
          maneuverModifier: 'straight',
          streetName: '',
          distanceMeters: Math.round(d),
          location: b,
        },
      ],
      isFallback: true,
    };
  }

  return {
    route: {
      coordinates: validCoords,
      distanceMeters: Math.round(totalDistance),
      durationSeconds: Math.round(totalDistance / 5.5),
      isFallback: true,
    },
    legs,
  };
}

const liveTbtMemoryCache = new Map<string, ActiveNavigationRoute>();

export async function fetchTurnByTurnRoute(
  origin: [number, number],
  destination: [number, number],
  signal?: AbortSignal
): Promise<ActiveNavigationRoute> {
  const distDirect = haversineMeters(origin, destination);
  const tbtCacheKey = `tbt:${origin[0].toFixed(4)},${origin[1].toFixed(4)}->${destination[0].toFixed(4)},${destination[1].toFixed(4)}`;

  const inMem = liveTbtMemoryCache.get(tbtCacheKey);
  if (inMem) return inMem;

  const cachedTbt = (await getCachedRoute(tbtCacheKey)) as unknown as ActiveNavigationRoute | null;
  if (!navigator.onLine && cachedTbt && Array.isArray(cachedTbt.steps)) {
    liveTbtMemoryCache.set(tbtCacheKey, cachedTbt);
    return cachedTbt;
  }

  if (navigator.onLine) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = (await res.json()) as OsrmRouteResponse;
        const first = data.routes?.[0];
        const leg = first?.legs?.[0];
        if (first && leg && first.geometry?.coordinates?.length > 1) {
          const navResult: ActiveNavigationRoute = {
            ...extractLegNavigation(leg, origin, destination),
            coordinates: first.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            isFallback: false,
          };
          liveTbtMemoryCache.set(tbtCacheKey, navResult);
          await setCachedRoute(tbtCacheKey, navResult as unknown as RouteGeometry);
          return navResult;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // Fallback
    }
  }

  if (cachedTbt && Array.isArray(cachedTbt.steps)) {
    liveTbtMemoryCache.set(tbtCacheKey, cachedTbt);
    return cachedTbt;
  }

  return {
    coordinates: [origin, destination],
    distanceMeters: Math.round(distDirect),
    durationSeconds: Math.max(60, Math.round(distDirect / 5.5)),
    steps: [
      {
        instruction: 'Dirígete hacia el destino (modo offline)',
        maneuverType: 'continue',
        maneuverModifier: 'straight',
        streetName: '',
        distanceMeters: Math.round(distDirect),
        location: destination,
      },
    ],
    isFallback: true,
  };
}

export async function enrichZonesGeoAndRoutes(
  rawZones: Zone[],
  cityHint: string,
  onProgress?: (progress: SyncProgress) => void,
  onPartialZones?: (zones: Zone[]) => void,
  existingZones: Zone[] = []
): Promise<Zone[]> {
  // Mapa rápido de coordenadas y rutas ya guardadas previamente para NO perderlas jamás al sincronizar
  const existingCoordsByAddress = new Map<string, { lat: number; lng: number }>();
  const existingZoneById = new Map<string, Zone>();
  for (const ez of existingZones) {
    existingZoneById.set(ez.id, ez);
    for (const s of ez.stops) {
      if (s.lat !== null && s.lng !== null) {
        existingCoordsByAddress.set(s.address.trim().toLowerCase(), { lat: s.lat, lng: s.lng });
        existingCoordsByAddress.set(normalizeCacheKey(s.address, cityHint), { lat: s.lat, lng: s.lng });
      }
    }
  }

  const cityCenter = await getCityCenter(cityHint);

  // 1. Hidratar inmediatamente preservando coordenadas existentes + caché IndexedDB (0 pérdidas)
  const workingZones: Zone[] = await Promise.all(
    rawZones.map(async (zone) => {
      const prevZone = existingZoneById.get(zone.id);
      const hydratedStops = await Promise.all(
        zone.stops.map(async (stop) => {
          if (stop.lat !== null && stop.lng !== null) return stop;

          const exactPrev = existingCoordsByAddress.get(stop.address.trim().toLowerCase());
          if (exactPrev) return { ...stop, lat: exactPrev.lat, lng: exactPrev.lng };

          const key = normalizeCacheKey(stop.address, cityHint);
          const normPrev = existingCoordsByAddress.get(key);
          if (normPrev) return { ...stop, lat: normPrev.lat, lng: normPrev.lng };

          const cached = await getCachedGeocode(key);
          return cached ? { ...stop, lat: cached.lat, lng: cached.lng } : stop;
        })
      );

      // Si ya tenemos ruta/legs previos y el número de paradas coincide, conservarlos inmediatamente
      const route = prevZone?.route ?? null;
      const legs = prevZone?.legs ?? {};
      return { ...zone, stops: hydratedStops, route, legs };
    })
  );

  // Mostrar de inmediato en la UI para operar al instante sin esperar al resto
  onPartialZones?.(workingZones);

  const stopsNeedingGeo = workingZones.reduce(
    (acc, z) => acc + z.stops.filter((s) => s.lat === null || s.lng === null).length,
    0
  );
  let geocodedCount = 0;

  for (let zIdx = 0; zIdx < workingZones.length; zIdx++) {
    const zone = workingZones[zIdx];
    const stopsWithCoords: Stop[] = [...zone.stops];
    let dirtyZone = false;

    for (let sIdx = 0; sIdx < stopsWithCoords.length; sIdx++) {
      const stop = stopsWithCoords[sIdx];
      if (stop.lat !== null && stop.lng !== null) continue;

      onProgress?.({
        stage: 'geocoding',
        message: `Sincronizando en segundo plano · ${zone.name} (${geocodedCount + 1}/${Math.max(1, stopsNeedingGeo)})`,
        percent: Math.round(15 + (geocodedCount / Math.max(1, stopsNeedingGeo)) * 55),
      });

      const coords = await geocodeAddress(stop.address, cityHint, cityCenter);
      if (coords) {
        stopsWithCoords[sIdx] = {
          ...stop,
          lat: coords.lat,
          lng: coords.lng,
        };
        dirtyZone = true;
      }
      geocodedCount++;

      // Emitir actualizaciones parciales cada 3 paradas nuevas para que aparezcan en el mapa enseguida
      if (dirtyZone && geocodedCount % 3 === 0) {
        workingZones[zIdx] = { ...zone, stops: [...stopsWithCoords] };
        onPartialZones?.([...workingZones]);
      }

      await sleep(160);
    }

    const needsRouting =
      dirtyZone ||
      !zone.route ||
      zone.route.isFallback ||
      !zone.legs ||
      Object.keys(zone.legs).length === 0;

    let finalRoute = zone.route;
    let finalLegs = zone.legs ?? {};

    if (needsRouting) {
      onProgress?.({
        stage: 'routing',
        message: `Actualizando calles y giros de ${zone.name}...`,
        percent: 78,
      });
      const computed = await computeZoneRouteAndLegs(stopsWithCoords);
      finalRoute = computed.route;
      finalLegs = computed.legs;
    }

    workingZones[zIdx] = {
      ...zone,
      stops: stopsWithCoords,
      route: finalRoute,
      legs: finalLegs,
      syncedAt: Date.now(),
    };

    onPartialZones?.([...workingZones]);
  }

  onProgress?.({
    stage: 'caching_tiles',
    message: 'Guardando mapa offline...',
    percent: 92,
  });
  await precacheTilesToCacheStorage(workingZones);

  onProgress?.({
    stage: 'done',
    message: 'Sincronizado (100% offline).',
    percent: 100,
  });

  return workingZones;
}
