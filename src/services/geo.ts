import { getCachedGeocode, getCachedRoute, setCachedGeocode, setCachedRoute } from './db';
import type { ActiveNavigationRoute, NavStep, RouteGeometry, Stop, SyncProgress, Zone } from '../types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeQuery(address: string, cityHint: string): string {
  const cleanAddr = address.trim().toLowerCase();
  const cleanCity = cityHint.trim().toLowerCase();
  if (!cleanCity) return cleanAddr;
  if (cleanAddr.includes(cleanCity.split(',')[0].trim())) return cleanAddr;
  return `${cleanAddr}, ${cleanCity}`;
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

export async function geocodeAddress(
  address: string,
  cityHint: string
): Promise<{ lat: number; lng: number } | null> {
  const query = normalizeQuery(address, cityHint);
  const cached = await getCachedGeocode(query);
  if (cached) return cached;

  if (!navigator.onLine) return null;

  // Quitar puerta/piso si Nominatim no encuentra la dirección exacta
  const simplifiedAddress = address.split(',').slice(0, 2).join(',').trim();
  const attempts = [query];
  const simplifiedQuery = normalizeQuery(simplifiedAddress, cityHint);
  if (simplifiedQuery !== query) {
    attempts.push(simplifiedQuery);
  }

  for (const q of attempts) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        q
      )}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          await setCachedGeocode(query, lat, lng);
          return { lat, lng };
        }
      }
    } catch {
      // Silencioso para fallback
    }
    await sleep(950);
  }

  return null;
}

export async function computeRouteForStops(stops: Stop[]): Promise<RouteGeometry | null> {
  const validCoords = stops
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => [s.lat as number, s.lng as number] as [number, number]);

  if (validCoords.length === 0) return null;
  if (validCoords.length === 1) {
    return {
      coordinates: validCoords,
      distanceMeters: 0,
      durationSeconds: 0,
      isFallback: true,
    };
  }

  const cacheKey = validCoords.map(([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join(';');
  const cached = await getCachedRoute(cacheKey);
  if (cached) return cached;

  if (navigator.onLine) {
    try {
      const osrmCoords = validCoords.map(([lat, lng]) => `${lng},${lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          routes?: Array<{
            distance: number;
            duration: number;
            geometry: { coordinates: [number, number][] };
          }>;
        };
        const first = data.routes?.[0];
        if (first && first.geometry?.coordinates?.length > 1) {
          const route: RouteGeometry = {
            coordinates: first.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            distanceMeters: Math.round(first.distance),
            durationSeconds: Math.round(first.duration),
            isFallback: false,
          };
          await setCachedRoute(cacheKey, route);
          return route;
        }
      }
    } catch {
      // Fallback a polilínea directa
    }
  }

  let totalDistance = 0;
  for (let i = 1; i < validCoords.length; i++) {
    totalDistance += haversineMeters(validCoords[i - 1], validCoords[i]);
  }

  const fallback: RouteGeometry = {
    coordinates: validCoords,
    distanceMeters: Math.round(totalDistance),
    durationSeconds: Math.round(totalDistance / 5.5),
    isFallback: true,
  };
  await setCachedRoute(cacheKey, fallback);
  return fallback;
}

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export async function precacheTilesForZones(zones: Zone[]): Promise<void> {
  if (!navigator.onLine) return;

  const tileUrls = new Set<string>();
  const zooms = [15, 16];

  for (const zone of zones) {
    const pts = zone.stops.filter((s) => s.lat !== null && s.lng !== null);
    if (pts.length === 0) continue;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const p of pts) {
      minLat = Math.min(minLat, p.lat as number);
      maxLat = Math.max(maxLat, p.lat as number);
      minLng = Math.min(minLng, p.lng as number);
      maxLng = Math.max(maxLng, p.lng as number);
    }

    for (const z of zooms) {
      const topLeft = latLngToTile(maxLat, minLng, z);
      const bottomRight = latLngToTile(minLat, maxLng, z);
      for (let x = topLeft.x - 1; x <= bottomRight.x + 1; x++) {
        for (let y = topLeft.y - 1; y <= bottomRight.y + 1; y++) {
          tileUrls.add(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
          if (tileUrls.size >= 80) break;
        }
        if (tileUrls.size >= 80) break;
      }
    }
  }

  // Precarga en pequeños lotes para no saturar red ni CPU
  const urls = Array.from(tileUrls);
  const batchSize = 6;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((u) => fetch(u, { mode: 'cors' })));
  }
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

export async function fetchTurnByTurnRoute(
  origin: [number, number],
  destination: [number, number]
): Promise<ActiveNavigationRoute> {
  const distDirect = haversineMeters(origin, destination);

  if (navigator.onLine) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          routes?: Array<{
            distance: number;
            duration: number;
            geometry: { coordinates: [number, number][] };
            legs?: Array<{
              steps?: Array<{
                name?: string;
                distance: number;
                maneuver: {
                  type: string;
                  modifier?: string;
                  location: [number, number];
                };
              }>;
            }>;
          }>;
        };

        const first = data.routes?.[0];
        if (first && first.geometry?.coordinates?.length > 1) {
          const rawSteps = first.legs?.[0]?.steps ?? [];
          const steps: NavStep[] = rawSteps.map((s) => {
            const street = (s.name ?? '').trim();
            return {
              instruction: buildSpanishInstruction(s.maneuver.type, s.maneuver.modifier, street),
              maneuverType: s.maneuver.type,
              maneuverModifier: s.maneuver.modifier,
              streetName: street,
              distanceMeters: Math.round(s.distance),
              location: [s.maneuver.location[1], s.maneuver.location[0]],
            };
          });

          return {
            coordinates: first.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            distanceMeters: Math.round(first.distance),
            durationSeconds: Math.round(first.duration),
            steps,
            isFallback: false,
          };
        }
      }
    } catch {
      // Fallback offline limpio
    }
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
  onProgress?: (progress: SyncProgress) => void
): Promise<Zone[]> {
  const totalStops = rawZones.reduce((acc, z) => acc + z.stops.length, 0);
  let processedStops = 0;
  const enriched: Zone[] = [];

  for (const zone of rawZones) {
    const stopsWithCoords: Stop[] = [];
    for (const stop of zone.stops) {
      if (stop.lat !== null && stop.lng !== null) {
        stopsWithCoords.push(stop);
      } else {
        onProgress?.({
          stage: 'geocoding',
          message: `Geocodificando ${zone.name} (${processedStops + 1}/${totalStops})...`,
          percent: Math.round(15 + (processedStops / Math.max(1, totalStops)) * 55),
        });
        const coords = await geocodeAddress(stop.address, cityHint);
        stopsWithCoords.push({
          ...stop,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
      }
      processedStops++;
    }

    onProgress?.({
      stage: 'routing',
      message: `Calculando ruta de ${zone.name}...`,
      percent: 78,
    });
    const route = await computeRouteForStops(stopsWithCoords);

    enriched.push({
      ...zone,
      stops: stopsWithCoords,
      route,
      syncedAt: Date.now(),
    });
  }

  onProgress?.({
    stage: 'caching_tiles',
    message: 'Guardando mapas offline de las zonas...',
    percent: 90,
  });
  await precacheTilesForZones(enriched);

  onProgress?.({
    stage: 'done',
    message: 'Sincronización completada. Listo para modo sin Wi-Fi.',
    percent: 100,
  });

  return enriched;
}
