import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Crosshair, ExternalLink, MapPin } from 'lucide-react';
import type { GeoPosition } from '../hooks/useGeolocation';
import type { Stop, Zone } from '../types';

interface RouteMapProps {
  zone: Zone;
  currentIndex: number;
  driverPosition: GeoPosition | null;
  gpsError: string | null;
}

function createStopIcon(label: number, state: 'done' | 'current' | 'upcoming'): L.DivIcon {
  const bg =
    state === 'current'
      ? '#F59E0B'
      : state === 'done'
        ? '#10B981'
        : '#334155';
  const textColor = state === 'current' ? '#090D16' : '#F8FAFC';
  const size = state === 'current' ? 36 : 26;
  const ring =
    state === 'current'
      ? 'box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.35), 0 4px 12px rgba(0,0,0,0.6); font-weight: 800; font-size: 15px;'
      : 'box-shadow: 0 2px 6px rgba(0,0,0,0.5); font-weight: 700; font-size: 12px;';

  return L.divIcon({
    className: 'msv-stop-marker',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:${textColor};display:flex;align-items:center;justify-content:center;border:2px solid #fff;${ring}">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createDriverIcon(): L.DivIcon {
  return L.divIcon({
    className: 'msv-driver-marker',
    html: `<div style="width:20px;height:20px;border-radius:9999px;background:#38BDF8;border:3px solid #fff;box-shadow:0 0 0 8px rgba(56,189,248,0.35);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export function RouteMap({ zone, currentIndex, driverPosition, gpsError }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);

  const currentStop: Stop | undefined = zone.stops[currentIndex];

  // Inicializar mapa una sola vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const firstValid = zone.stops.find((s) => s.lat !== null && s.lng !== null);
    const initialCenter: [number, number] = firstValid
      ? [firstValid.lat as number, firstValid.lng as number]
      : [41.3874, 2.1686];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });

    L.tileLayer('https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markersLayerRef.current = null;
      driverMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualizar trazado de ruta cuando cambia la zona
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    const coords =
      zone.route && zone.route.coordinates.length > 1
        ? zone.route.coordinates
        : zone.stops
            .filter((s) => s.lat !== null && s.lng !== null)
            .map((s) => [s.lat as number, s.lng as number] as [number, number]);

    if (coords.length > 1) {
      routeLayerRef.current = L.polyline(coords, {
        color: '#F59E0B',
        weight: 5,
        opacity: 0.85,
        dashArray: zone.route?.isFallback ? '8 8' : undefined,
      }).addTo(map);
    }
  }, [zone]);

  // Actualizar marcadores de paradas y centrar en la parada actual
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    zone.stops.forEach((stop, idx) => {
      if (stop.lat === null || stop.lng === null) return;
      const state = idx < currentIndex ? 'done' : idx === currentIndex ? 'current' : 'upcoming';
      const marker = L.marker([stop.lat, stop.lng], {
        icon: createStopIcon(idx + 1, state),
        zIndexOffset: state === 'current' ? 1000 : idx,
      });
      marker.bindTooltip(`${idx + 1}. ${stop.address}`, { direction: 'top' });
      marker.addTo(layer);
    });

    if (currentStop && currentStop.lat !== null && currentStop.lng !== null) {
      map.setView([currentStop.lat, currentStop.lng], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.45,
      });
    }
  }, [zone, currentIndex, currentStop]);

  // Actualizar marcador del conductor de forma imperativa (bajo consumo)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverPosition) return;

    const latLng: [number, number] = [driverPosition.lat, driverPosition.lng];
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = L.marker(latLng, {
        icon: createDriverIcon(),
        zIndexOffset: 2000,
      }).addTo(map);
    } else {
      driverMarkerRef.current.setLatLng(latLng);
    }
  }, [driverPosition]);

  const handleCenterDriver = () => {
    const map = mapRef.current;
    if (!map || !driverPosition) return;
    map.setView([driverPosition.lat, driverPosition.lng], 17, { animate: true });
  };

  const handleCenterStop = () => {
    const map = mapRef.current;
    if (!map || !currentStop || currentStop.lat === null || currentStop.lng === null) return;
    map.setView([currentStop.lat, currentStop.lng], 17, { animate: true });
  };

  const openExternalMaps = () => {
    if (!currentStop) return;
    const dest =
      currentStop.lat !== null && currentStop.lng !== null
        ? `${currentStop.lat},${currentStop.lng}`
        : encodeURIComponent(currentStop.address);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <div className="relative h-full w-full bg-surface-900">
      <div ref={containerRef} className="h-full w-full z-0" />

      {gpsError && (
        <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-lg bg-surface-950/90 px-3 py-1.5 text-xs font-medium text-amber-300 border border-amber-500/40">
          {gpsError}
        </div>
      )}

      {/* Botones táctiles flotantes de control de mapa */}
      <div className="absolute bottom-3 right-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleCenterStop}
          disabled={!currentStop || currentStop.lat === null}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-surface-950 shadow-lg active:scale-95 disabled:opacity-40"
          aria-label="Centrar en parada actual"
          title="Centrar en parada actual"
        >
          <MapPin className="h-6 w-6" />
        </button>

        <button
          type="button"
          onClick={handleCenterDriver}
          disabled={!driverPosition}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-950/95 text-sky-400 border border-sky-400/50 shadow-lg active:scale-95 disabled:opacity-40"
          aria-label="Centrar en mi ubicación"
          title="Centrar en mi ubicación"
        >
          <Crosshair className="h-6 w-6" />
        </button>

        <button
          type="button"
          onClick={openExternalMaps}
          disabled={!currentStop}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-950/95 text-white border border-slate-600 shadow-lg active:scale-95 disabled:opacity-40"
          aria-label="Abrir en Google Maps"
          title="Abrir en Google Maps"
        >
          <ExternalLink className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
