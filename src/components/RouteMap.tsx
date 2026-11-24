import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  ExternalLink,
  Flag,
  Navigation,
  RotateCcw,
} from 'lucide-react';
import type { GeoPosition } from '../hooks/useGeolocation';
import {
  fetchTurnByTurnRoute,
  formatDistanceEs,
  formatDurationEs,
  haversineMeters,
} from '../services/geo';
import { getTileUrl, OFFLINE_TILES_CACHE } from '../services/offlineTiles';
import type { ActiveNavigationRoute, NavStep, Stop, Zone } from '../types';

function createOfflineTileLayer(): L.GridLayer {
  const OfflineLayer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('role', 'presentation');
      img.style.width = '256px';
      img.style.height = '256px';

      const url = getTileUrl(coords.z, coords.x, coords.y);

      const loadTile = async () => {
        try {
          if (typeof caches !== 'undefined') {
            const cache = await caches.open(OFFLINE_TILES_CACHE);
            const cached = await cache.match(url);
            if (cached) {
              const blob = await cached.blob();
              const objUrl = URL.createObjectURL(blob);
              img.onload = () => {
                URL.revokeObjectURL(objUrl);
                done(undefined, img);
              };
              img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                done(undefined, img);
              };
              img.src = objUrl;
              return;
            }

            if (navigator.onLine) {
              const res = await fetch(url, { mode: 'cors' });
              if (res.ok) {
                await cache.put(url, res.clone());
                const blob = await res.blob();
                const objUrl = URL.createObjectURL(blob);
                img.onload = () => {
                  URL.revokeObjectURL(objUrl);
                  done(undefined, img);
                };
                img.onerror = () => {
                  URL.revokeObjectURL(objUrl);
                  done(undefined, img);
                };
                img.src = objUrl;
                return;
              }
            }
          }
        } catch {
          // Fallback directo a src
        }

        if (navigator.onLine) {
          img.crossOrigin = 'anonymous';
          img.onload = () => done(undefined, img);
          img.onerror = () => done(undefined, img);
          img.src = url;
        } else {
          done(undefined, img);
        }
      };

      void loadTile();
      return img;
    },
  });

  return new (OfflineLayer as unknown as new (opts?: L.GridLayerOptions) => L.GridLayer)({
    maxZoom: 19,
    minZoom: 12,
    tileSize: 256,
  });
}

interface RouteMapProps {
  zone: Zone;
  currentIndex: number;
  driverPosition: GeoPosition | null;
  gpsError: string | null;
}

function createStopIcon(label: number, state: 'done' | 'current' | 'upcoming'): L.DivIcon {
  if (state === 'current') {
    return L.divIcon({
      className: 'msv-stop-marker',
      html: `<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
        <div style="width:34px;height:34px;border-radius:9999px;background:#EA4335;color:#fff;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.45);font-weight:800;font-size:14px;">${label}</div>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  const bg = state === 'done' ? '#1E8E3E' : '#5F6368';
  return L.divIcon({
    className: 'msv-stop-marker',
    html: `<div style="width:24px;height:24px;border-radius:9999px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.35);font-weight:700;font-size:11px;">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createDriverIcon(heading: number | null): L.DivIcon {
  const rot = heading !== null && !Number.isNaN(heading) ? heading : 0;
  return L.divIcon({
    className: 'msv-driver-marker',
    html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;transform:rotate(${rot}deg);">
      <div style="width:28px;height:28px;border-radius:9999px;background:#1A73E8;border:3px solid #fff;box-shadow:0 0 0 8px rgba(66,133,244,0.28),0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
      </div>
    </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function ManeuverIcon({ step }: { step: NavStep }) {
  const mod = step.maneuverModifier ?? '';
  if (step.maneuverType === 'arrive') return <Flag className="h-7 w-7 shrink-0 text-white" />;
  if (mod.includes('left')) return <CornerUpLeft className="h-7 w-7 shrink-0 text-white" />;
  if (mod.includes('right')) return <CornerUpRight className="h-7 w-7 shrink-0 text-white" />;
  if (mod === 'uturn') return <RotateCcw className="h-7 w-7 shrink-0 text-white" />;
  return <ArrowUp className="h-7 w-7 shrink-0 text-white" />;
}

export function RouteMap({ zone, currentIndex, driverPosition, gpsError }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoneRouteRef = useRef<L.Polyline | null>(null);
  const activeRouteOutlineRef = useRef<L.Polyline | null>(null);
  const activeRouteLineRef = useRef<L.Polyline | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const lastRoutedOriginRef = useRef<[number, number] | null>(null);

  const [followMode, setFollowMode] = useState(true);
  const [navRoute, setNavRoute] = useState<ActiveNavigationRoute | null>(null);

  const currentStop: Stop | undefined = zone.stops[currentIndex];
  const prevStop: Stop | undefined = currentIndex > 0 ? zone.stops[currentIndex - 1] : undefined;

  // Inicializar mapa Leaflet una sola vez
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

    // Capa OSM con caché offline directa en Cache API (funciona 100% sin Wi-Fi en Android APK)
    createOfflineTileLayer().addTo(map);

    map.on('dragstart', () => {
      setFollowMode(false);
    });

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      zoneRouteRef.current = null;
      activeRouteOutlineRef.current = null;
      activeRouteLineRef.current = null;
      markersLayerRef.current = null;
      driverMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trazado sutil del resto de la zona
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (zoneRouteRef.current) {
      zoneRouteRef.current.remove();
      zoneRouteRef.current = null;
    }

    const coords =
      zone.route && zone.route.coordinates.length > 1
        ? zone.route.coordinates
        : zone.stops
            .filter((s) => s.lat !== null && s.lng !== null)
            .map((s) => [s.lat as number, s.lng as number] as [number, number]);

    if (coords.length > 1) {
      zoneRouteRef.current = L.polyline(coords, {
        color: '#94A3B8',
        weight: 4,
        opacity: 0.55,
        dashArray: '6 8',
      }).addTo(map);
    }
  }, [zone]);

  // Calcular ruta paso a paso estilo Google Maps hacia el destino actual
  useEffect(() => {
    if (!currentStop || currentStop.lat === null || currentStop.lng === null) {
      setNavRoute(null);
      return;
    }

    const dest: [number, number] = [currentStop.lat, currentStop.lng];
    let origin: [number, number] | null = null;

    if (driverPosition) {
      origin = [driverPosition.lat, driverPosition.lng];
    } else if (prevStop && prevStop.lat !== null && prevStop.lng !== null) {
      origin = [prevStop.lat, prevStop.lng];
    } else if (zone.stops.length > 1) {
      const nextFallback = zone.stops.find(
        (s) => s.id !== currentStop.id && s.lat !== null && s.lng !== null
      );
      if (nextFallback) {
        origin = [nextFallback.lat as number, nextFallback.lng as number];
      }
    }

    if (!origin) {
      setNavRoute(null);
      return;
    }

    // Evitar recálculos innecesarios si el conductor se movió menos de 25 metros
    if (
      lastRoutedOriginRef.current &&
      haversineMeters(lastRoutedOriginRef.current, origin) < 25 &&
      navRoute !== null
    ) {
      return;
    }

    let cancelled = false;
    lastRoutedOriginRef.current = origin;

    fetchTurnByTurnRoute(origin, dest).then((result) => {
      if (!cancelled) {
        setNavRoute(result);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentStop?.id,
    currentStop?.lat,
    currentStop?.lng,
    driverPosition?.lat,
    driverPosition?.lng,
  ]);

  // Resetear origen cacheado al cambiar de parada
  useEffect(() => {
    lastRoutedOriginRef.current = null;
  }, [currentIndex, zone.id]);

  // Dibujar la ruta activa azul estilo Google Maps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activeRouteOutlineRef.current) {
      activeRouteOutlineRef.current.remove();
      activeRouteOutlineRef.current = null;
    }
    if (activeRouteLineRef.current) {
      activeRouteLineRef.current.remove();
      activeRouteLineRef.current = null;
    }

    if (!navRoute || navRoute.coordinates.length < 2) return;

    activeRouteOutlineRef.current = L.polyline(navRoute.coordinates, {
      color: '#174EA6',
      weight: 9,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    activeRouteLineRef.current = L.polyline(navRoute.coordinates, {
      color: '#4285F4',
      weight: 6,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    if (followMode && !driverPosition) {
      map.fitBounds(L.latLngBounds(navRoute.coordinates), {
        paddingTopLeft: [24, 96],
        paddingBottomRight: [24, 32],
        maxZoom: 17,
      });
    }
  }, [navRoute, followMode, driverPosition]);

  // Marcadores de paradas
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

    if (followMode && currentStop && currentStop.lat !== null && currentStop.lng !== null && !driverPosition) {
      map.setView([currentStop.lat, currentStop.lng], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.4,
      });
    }
  }, [zone, currentIndex, currentStop, followMode, driverPosition]);

  // Marcador del conductor + seguimiento automático
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverPosition) return;

    const latLng: [number, number] = [driverPosition.lat, driverPosition.lng];
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = L.marker(latLng, {
        icon: createDriverIcon(driverPosition.heading),
        zIndexOffset: 2000,
      }).addTo(map);
    } else {
      driverMarkerRef.current.setLatLng(latLng);
      driverMarkerRef.current.setIcon(createDriverIcon(driverPosition.heading));
    }

    if (followMode) {
      map.setView(latLng, Math.max(map.getZoom(), 17), { animate: true, duration: 0.4 });
    }
  }, [driverPosition, followMode]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    setFollowMode(true);
    if (driverPosition) {
      map.setView([driverPosition.lat, driverPosition.lng], 17, { animate: true });
    } else if (navRoute && navRoute.coordinates.length > 1) {
      map.fitBounds(L.latLngBounds(navRoute.coordinates), {
        paddingTopLeft: [24, 96],
        paddingBottomRight: [24, 32],
        maxZoom: 17,
      });
    } else if (currentStop && currentStop.lat !== null && currentStop.lng !== null) {
      map.setView([currentStop.lat, currentStop.lng], 17, { animate: true });
    }
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

  // Elegir la próxima maniobra relevante
  const nextStep: NavStep | null =
    navRoute && navRoute.steps.length > 0
      ? navRoute.steps.find((s, i) => i > 0 && s.distanceMeters > 10) ?? navRoute.steps[0]
      : null;

  return (
    <div className="relative h-full w-full bg-slate-200">
      <div ref={containerRef} className="h-full w-full z-0" />

      {/* Banner superior de navegación paso a paso estilo Google Maps */}
      {nextStep && navRoute && (
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-[400]">
          <div className="flex items-center gap-3 rounded-2xl bg-[#0F766E] px-4 py-3 text-white shadow-xl ring-1 ring-black/15">
            <ManeuverIcon step={nextStep} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-extrabold leading-none">
                  {formatDistanceEs(nextStep.distanceMeters || navRoute.distanceMeters)}
                </span>
                <span className="text-xs font-medium text-teal-100">
                  · {formatDurationEs(navRoute.durationSeconds)} ({formatDistanceEs(navRoute.distanceMeters)})
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-white/95">
                {nextStep.instruction}
              </p>
            </div>
          </div>
        </div>
      )}

      {gpsError && !nextStep && (
        <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-xl bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow">
          {gpsError}
        </div>
      )}

      {/* Botón "Recentrar" estilo Google Maps cuando se mueve el mapa */}
      {!followMode && (
        <button
          type="button"
          onClick={handleRecenter}
          className="absolute bottom-4 left-3 z-[400] flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#1A73E8] shadow-lg ring-1 ring-black/10 active:scale-95"
        >
          <Navigation className="h-4 w-4 fill-current" />
          Recentrar
        </button>
      )}

      {/* Botones flotantes derechos (Centrar GPS + Abrir Google Maps) */}
      <div className="absolute bottom-4 right-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-lg ring-1 ring-black/10 active:scale-95"
          aria-label="Centrar ruta"
          title="Centrar ruta"
        >
          <Crosshair className="h-5 w-5 text-[#1A73E8]" />
        </button>

        <button
          type="button"
          onClick={openExternalMaps}
          disabled={!currentStop}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-lg ring-1 ring-black/10 active:scale-95 disabled:opacity-40"
          aria-label="Abrir en Google Maps"
          title="Abrir en Google Maps"
        >
          <ExternalLink className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
