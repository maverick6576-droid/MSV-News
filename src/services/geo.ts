import { getCachedGeocode, getCachedRoute, setCachedGeocode, setCachedRoute } from './db';
import type { RouteGeometry, Stop, SyncProgress, Zone } from '../types';

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
          tileUrls.add(`https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
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
