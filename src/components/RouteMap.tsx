import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertTriangle,
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
  distanceToPolylineMeters,
  fetchTurnByTurnRoute,
  formatDistanceEs,
  formatDurationEs,
  formatEtaTimeEs,
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

/**
 * Pin rojo clásico en forma de gota estilo Google Maps para la parada actual.
 */
function createStopIcon(label: number, state: 'done' | 'current' | 'upcoming'): L.DivIcon {
  if (state === 'current') {
    return L.divIcon({
      className: 'msv-stop-marker',
      html: `<div style="position:relative;width:36px;height:44px;display:flex;align-items:flex-start;justify-content:center;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.45));">
        <svg width="36" height="44" viewBox="0 0 36 44" fill="none">
          <path d="M18 1C8.611 1 1 8.611 1 18c0 11.4 17 25 17 25s17-13.6 17-25C35 8.611 27.389 1 18 1z" fill="#EA4335" stroke="#FFFFFF" stroke-width="2"/>
          <circle cx="18" cy="17" r="9.5" fill="#FFFFFF"/>
        </svg>
        <span style="position:absolute;top:9px;left:0;right:0;text-align:center;color:#B31412;font-weight:800;font-size:12px;line-height:16px;">${label}</span>
      </div>`,
      iconSize: [36, 44],
      iconAnchor: [18, 43],
    });
  }

  const bg = state === 'done' ? '#1E8E3E' : '#5F6368';
  return L.divIcon({
    className: 'msv-stop-marker',
    html: `<div style="width:20px;height:20px;border-radius:9999px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);font-weight:700;font-size:10px;">${label}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createDriverIcon(heading: number | null): L.DivIcon {
  const rot = heading !== null && !Number.isNaN(heading) ? heading : 0;
  return L.divIcon({
    className: 'msv-driver-marker',
    html: `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;transform:rotate(${rot}deg);">
      <div style="width:30px;height:30px;border-radius:9999px;background:#FFFFFF;border:2px solid #1A73E8;box-shadow:0 0 0 10px rgba(66,133,244,0.22),0 3px 8px rgba(0,0,0,0.38);display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#1A73E8"><path d="M12 2L4.5 20.29l.71.71L12 17.5l6.79 3.5.71-.71z"/></svg>
      </div>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function createDirectionArrowIcon(angleDeg: number): L.DivIcon {
  return L.divIcon({
    className: 'msv-dir-arrow',
    html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;transform:rotate(${angleDeg}deg);pointer-events:none;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"/></svg>
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLng = toRad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function ManeuverIcon({ step, size = 'lg' }: { step: NavStep; size?: 'lg' | 'sm' }) {
  const cls = size === 'lg' ? 'h-8 w-8 shrink-0 text-white' : 'h-4 w-4 shrink-0 text-emerald-100';
  const mod = step.maneuverModifier ?? '';
  if (step.maneuverType === 'arrive') return <Flag className={cls} />;
  if (mod.includes('left')) return <CornerUpLeft className={cls} />;
  if (mod.includes('right')) return <CornerUpRight className={cls} />;
  if (mod === 'uturn') return <RotateCcw className={cls} />;
  return <ArrowUp className={cls} />;
}

export function RouteMap({ zone, currentIndex, driverPosition, gpsError }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const zoneRouteRef = useRef<L.Polyline | null>(null);
  const activeRouteOutlineRef = useRef<L.Polyline | null>(null);
  const activeRouteLineRef = useRef<L.Polyline | null>(null);
  const directionArrowsLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const lastLiveFetchOriginRef = useRef<[number, number] | null>(null);

  const [followMode, setFollowMode] = useState(true);
  const [liveRouteOverride, setLiveRouteOverride] = useState<ActiveNavigationRoute | null>(null);

  const currentStop: Stop | undefined = zone.stops[currentIndex];
  const prevStop: Stop | undefined = currentIndex > 0 ? zone.stops[currentIndex - 1] : undefined;

  // 1. Tramo precalculado instantáneo (0 ms) desde RAM / IndexedDB
  const precomputedLeg = useMemo<ActiveNavigationRoute | null>(() => {
    if (!currentStop) return null;
    if (prevStop && zone.legs) {
      const exact = zone.legs[`${prevStop.id}->${currentStop.id}`];
      if (exact) return exact;
    }
    // Si la parada anterior no tenía coords, buscar la última válida previa
    if (zone.legs) {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const candidate = zone.stops[i];
        const leg = zone.legs[`${candidate.id}->${currentStop.id}`];
        if (leg) return leg;
      }
    }
    return null;
  }, [zone.legs, zone.stops, prevStop, currentStop, currentIndex]);

  // Limpiar override en vivo al cambiar de parada para mostrar el tramo precalculado al instante
  useEffect(() => {
    setLiveRouteOverride(null);
    lastLiveFetchOriginRef.current = null;
    setFollowMode(true);
  }, [currentIndex, zone.id]);

  // Ruta activa mostrada: override GPS en vivo si existe, sino el tramo precalculado instantáneo
  const navRoute = liveRouteOverride ?? precomputedLeg;

  // 2. Inicializar mapa Leaflet una sola vez con renderer Canvas a 60 FPS
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const firstValid = zone.stops.find((s) => s.lat !== null && s.lng !== null);
    const initialCenter: [number, number] = firstValid
      ? [firstValid.lat as number, firstValid.lng as number]
      : [41.5381, 2.4447];

    const renderer = L.canvas({ padding: 0.5 });
    canvasRendererRef.current = renderer;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      renderer,
      fadeAnimation: false,
    });

    createOfflineTileLayer().addTo(map);

    map.on('dragstart', () => {
      setFollowMode(false);
    });

    directionArrowsLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      canvasRendererRef.current = null;
      zoneRouteRef.current = null;
      activeRouteOutlineRef.current = null;
      activeRouteLineRef.current = null;
      directionArrowsLayerRef.current = null;
      markersLayerRef.current = null;
      driverMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. Trazado sutil del resto de la zona en gris claro estilo Google Maps (ruta alternativa/fondo)
  useEffect(() => {
    const map = mapRef.current;
    const renderer = canvasRendererRef.current;
    if (!map || !renderer) return;

    if (zoneRouteRef.current) {
      zoneRouteRef.current.remove();
      zoneRouteRef.current = null;
    }

    const coords =
      zone.route && !zone.route.isFallback && zone.route.coordinates.length > 1
        ? zone.route.coordinates
        : [];

    if (coords.length > 1) {
      zoneRouteRef.current = L.polyline(coords, {
        renderer,
        color: '#80868B',
        weight: 4,
        opacity: 0.35,
      }).addTo(map);
    }
  }, [zone]);

  // 4. Recálculo en vivo desde GPS SOLO cuando hace falta (parada 1 sin tramo previo o desvío > 65m)
  useEffect(() => {
    if (!currentStop || currentStop.lat === null || currentStop.lng === null) return;
    const dest: [number, number] = [currentStop.lat, currentStop.lng];

    // Si no tenemos GPS y ya existe el tramo precalculado, no hace falta ninguna llamada de red
    if (!driverPosition) {
      if (precomputedLeg) return;
      // Si no hay tramo precalculado ni GPS, pero hay parada previa con coords, calcular una vez
      if (prevStop && prevStop.lat !== null && prevStop.lng !== null) {
        let cancelled = false;
        fetchTurnByTurnRoute([prevStop.lat, prevStop.lng], dest).then((res) => {
          if (!cancelled) setLiveRouteOverride(res);
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }

    const driverPt: [number, number] = [driverPosition.lat, driverPosition.lng];

    // Si ya estamos sobre la ruta precalculada (< 65m), reusarla sin gastar red ni tiempo
    if (
      precomputedLeg &&
      !precomputedLeg.isFallback &&
      distanceToPolylineMeters(driverPt, precomputedLeg.coordinates) < 65
    ) {
      return;
    }

    // Evitar recálculos seguidos si el conductor se movió menos de 35m desde el último cálculo
    if (
      lastLiveFetchOriginRef.current &&
      haversineMeters(lastLiveFetchOriginRef.current, driverPt) < 35
    ) {
      return;
    }

    let cancelled = false;
    lastLiveFetchOriginRef.current = driverPt;

    fetchTurnByTurnRoute(driverPt, dest).then((result) => {
      if (!cancelled) {
        setLiveRouteOverride(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    currentStop?.id,
    currentStop?.lat,
    currentStop?.lng,
    prevStop?.id,
    prevStop?.lat,
    prevStop?.lng,
    driverPosition?.lat,
    driverPosition?.lng,
    precomputedLeg,
  ]);

  // 5. Dibujar línea azul estilo Google Maps + flechas direccionales blancas
  useEffect(() => {
    const map = mapRef.current;
    const renderer = canvasRendererRef.current;
    const arrowsLayer = directionArrowsLayerRef.current;
    if (!map || !renderer || !arrowsLayer) return;

    if (activeRouteOutlineRef.current) {
      activeRouteOutlineRef.current.remove();
      activeRouteOutlineRef.current = null;
    }
    if (activeRouteLineRef.current) {
      activeRouteLineRef.current.remove();
      activeRouteLineRef.current = null;
    }
    arrowsLayer.clearLayers();

    if (!navRoute || navRoute.coordinates.length < 2) return;

    activeRouteOutlineRef.current = L.polyline(navRoute.coordinates, {
      renderer,
      color: '#174EA6',
      weight: 9.5,
      opacity: 0.92,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    activeRouteLineRef.current = L.polyline(navRoute.coordinates, {
      renderer,
      color: '#4285F4',
      weight: 6,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Colocar flechas direccionales blancas espaciadas cada ~95 metros a lo largo de la línea azul
    let accMeters = 45;
    for (let i = 1; i < navRoute.coordinates.length; i++) {
      const a = navRoute.coordinates[i - 1];
      const b = navRoute.coordinates[i];
      const seg = haversineMeters(a, b);
      accMeters += seg;
      if (accMeters >= 95 && seg > 6) {
        accMeters = 0;
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const angle = bearingDeg(a, b);
        L.marker(mid, {
          icon: createDirectionArrowIcon(angle),
          interactive: false,
          zIndexOffset: 500,
        }).addTo(arrowsLayer);
      }
    }

    if (followMode && !driverPosition) {
      map.fitBounds(L.latLngBounds(navRoute.coordinates), {
        paddingTopLeft: [28, 118],
        paddingBottomRight: [28, 56],
        maxZoom: 17,
        animate: true,
        duration: 0.35,
      });
    }
  }, [navRoute, followMode, driverPosition]);

  // 6. Marcadores de paradas (pin rojo Google Maps en destino actual)
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
        zIndexOffset: state === 'current' ? 1200 : idx,
      });
      marker.bindTooltip(`${idx + 1}. ${stop.address}`, { direction: 'top' });
      marker.addTo(layer);
    });

    if (
      followMode &&
      !navRoute &&
      currentStop &&
      currentStop.lat !== null &&
      currentStop.lng !== null &&
      !driverPosition
    ) {
      map.setView([currentStop.lat, currentStop.lng], 17, {
        animate: true,
        duration: 0.35,
      });
    }
  }, [zone, currentIndex, currentStop, followMode, driverPosition, navRoute]);

  // 7. Marcador del conductor + seguimiento fluido
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
      map.setView(latLng, Math.max(map.getZoom(), 17), { animate: true, duration: 0.35 });
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
        paddingTopLeft: [28, 118],
        paddingBottomRight: [28, 56],
        maxZoom: 17,
        animate: true,
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

  // Maniobra actual y siguiente (estilo doble tarjeta Google Maps)
  const { primaryStep, followingStep } = useMemo(() => {
    if (!navRoute || navRoute.steps.length === 0) {
      return { primaryStep: null, followingStep: null };
    }
    const meaningful = navRoute.steps.filter((s, i) => i === 0 || s.distanceMeters > 8 || s.maneuverType === 'arrive');
    const firstIdx = meaningful.length > 1 && meaningful[0].maneuverType === 'depart' ? 1 : 0;
    const p = meaningful[firstIdx] ?? meaningful[0];
    const f = meaningful[firstIdx + 1] && meaningful[firstIdx + 1].maneuverType !== 'arrive'
      ? meaningful[firstIdx + 1]
      : null;
    return { primaryStep: p, followingStep: f };
  }, [navRoute]);

  const missingCoords = currentStop && (currentStop.lat === null || currentStop.lng === null);

  return (
    <div className="relative h-full w-full bg-[#E8EAED]">
      <div ref={containerRef} className="gmaps-look h-full w-full z-0" />

      {/* Banner superior verde navegación estilo Google Maps */}
      {primaryStep && navRoute && !missingCoords && (
        <div className="pointer-events-none absolute left-3 right-3 top-2.5 z-[400]">
          <div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/20">
            <div className="flex items-center gap-3.5 bg-[#0F5338] px-4 py-3 text-white">
              <ManeuverIcon step={primaryStep} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[22px] font-extrabold leading-none tracking-tight">
                  {formatDistanceEs(primaryStep.distanceMeters || navRoute.distanceMeters)}
                </div>
                <p className="mt-1 truncate text-[15px] font-semibold text-white/95">
                  {primaryStep.instruction}
                </p>
              </div>
            </div>

            {followingStep && (
              <div className="flex items-center gap-2 bg-[#0B3D29] px-4 py-1.5 text-xs font-semibold text-emerald-100">
                <span className="text-emerald-200/80">Luego</span>
                <ManeuverIcon step={followingStep} size="sm" />
                <span className="truncate">{followingStep.instruction}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aviso si una dirección concreta no se pudo ubicar */}
      {missingCoords && (
        <div className="pointer-events-none absolute left-3 right-3 top-2.5 z-[400] flex items-center gap-2.5 rounded-2xl bg-amber-950/95 px-4 py-3 text-xs font-semibold text-amber-200 shadow-lg ring-1 ring-amber-500/40">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>Dirección sin coordenadas aún. Pulsa Sincronizar o ábrela en Google Maps.</span>
        </div>
      )}

      {gpsError && !primaryStep && !missingCoords && (
        <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-xl bg-black/85 px-3 py-1.5 text-xs font-medium text-white shadow">
          {gpsError}
        </div>
      )}

      {/* Pastilla inferior izquierda: ETA estilo Google Maps o botón Recentrar */}
      <div className="absolute bottom-5 left-3 z-[400] flex flex-col items-start gap-2">
        {!followMode && (
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#1A73E8] shadow-lg ring-1 ring-black/15 active:scale-95"
          >
            <Navigation className="h-4 w-4 fill-current" />
            Recentrar
          </button>
        )}

        {navRoute && !missingCoords && (
          <div className="pointer-events-none rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-[#202124] shadow-md ring-1 ring-black/10">
            <span className="text-[#137333] font-extrabold">
              {formatDurationEs(navRoute.durationSeconds)}
            </span>
            <span className="mx-1.5 text-neutral-400">·</span>
            <span>{formatDistanceEs(navRoute.distanceMeters)}</span>
            <span className="mx-1.5 text-neutral-400">·</span>
            <span className="text-neutral-600">{formatEtaTimeEs(navRoute.durationSeconds)}</span>
          </div>
        )}
      </div>

      {/* Botones flotantes derechos estilo Google Maps */}
      <div className="absolute bottom-5 right-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#1A73E8] shadow-lg ring-1 ring-black/15 active:scale-95"
          aria-label="Centrar ruta"
          title="Centrar ruta"
        >
          <Crosshair className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={openExternalMaps}
          disabled={!currentStop}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#3C4043] shadow-lg ring-1 ring-black/15 active:scale-95 disabled:opacity-40"
          aria-label="Abrir en Google Maps"
          title="Abrir en Google Maps"
        >
          <ExternalLink className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
