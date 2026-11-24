import type { Zone } from '../types';

export const OFFLINE_TILES_CACHE = 'msv-offline-tiles-v1';

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export function getTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/**
 * Descarga y guarda los tiles de OSM en Cache API (funciona en Android APK Capacitor y navegadores).
 */
export async function precacheTilesToCacheStorage(zones: Zone[]): Promise<void> {
  if (!navigator.onLine || typeof caches === 'undefined') return;

  const tileUrls = new Set<string>();
  const zooms = [14, 15, 16];

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
          tileUrls.add(getTileUrl(z, x, y));
          if (tileUrls.size >= 140) break;
        }
        if (tileUrls.size >= 140) break;
      }
      if (tileUrls.size >= 140) break;
    }
  }

  const cache = await caches.open(OFFLINE_TILES_CACHE);
  const urls = Array.from(tileUrls);
  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    if (!navigator.onLine) break;
    const batch = urls.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (url) => {
        const existing = await cache.match(url);
        if (existing) return;
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) {
          await cache.put(url, res.clone());
        }
      })
    );
  }
}
