import { useEffect, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
}

const LAST_GPS_KEY = 'msv-last-known-gps';

function readCachedPosition(): GeoPosition | null {
  try {
    const raw = localStorage.getItem(LAST_GPS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeoPosition & { ts?: number };
    // Usar última ubicación reciente (< 2 horas) para arranque instantáneo mientras llega el nuevo fix GPS
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      (!parsed.ts || Date.now() - parsed.ts < 1000 * 60 * 120)
    ) {
      return {
        lat: parsed.lat,
        lng: parsed.lng,
        accuracy: parsed.accuracy ?? 50,
        heading: parsed.heading ?? null,
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function useGeolocation(active: boolean) {
  const [position, setPosition] = useState<GeoPosition | null>(() => readCachedPosition());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('GPS no disponible en este dispositivo.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        const next: GeoPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
        };
        setPosition(next);
        try {
          localStorage.setItem(LAST_GPS_KEY, JSON.stringify({ ...next, ts: Date.now() }));
        } catch {
          // ignore
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Permiso de ubicación denegado.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Señal GPS no disponible.');
        } else {
          setError('Buscando señal GPS...');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 12000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active]);

  return { position, error };
}
