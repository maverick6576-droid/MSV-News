import { useEffect, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
}

export function useGeolocation(active: boolean) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
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
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
        });
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
        maximumAge: 4000,
        timeout: 12000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active]);

  return { position, error };
}
