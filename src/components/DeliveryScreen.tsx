import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Flag,
  RotateCcw,
  Settings,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';
import type { Zone, ZoneProgress } from '../types';
import { RouteMap } from './RouteMap';

interface DeliveryScreenProps {
  zone: Zone;
  progress: ZoneProgress;
  isOnline: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSpeak: () => void;
  onFinishRoute: () => void;
  onRestartRoute: () => void;
  onBackToZones: () => void;
  onOpenSettings: () => void;
}

export function DeliveryScreen({
  zone,
  progress,
  isOnline,
  onNext,
  onPrev,
  onSpeak,
  onFinishRoute,
  onRestartRoute,
  onBackToZones,
  onOpenSettings,
}: DeliveryScreenProps) {
  const { position, error: gpsError } = useGeolocation(!progress.completed);
  const totalStops = zone.stops.length;
  const currentStop = zone.stops[progress.currentIndex];
  const isFirst = progress.currentIndex <= 0;
  const isLast = progress.currentIndex >= totalStops - 1;
  const progressPct = totalStops > 0 ? Math.round(((progress.currentIndex + 1) / totalStops) * 100) : 0;

  if (progress.completed) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0B0F17] px-6 py-10 text-white">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Ruta completada</h2>
          <p className="mt-2 text-sm text-slate-400">
            {totalStops} paradas entregadas en <span className="font-semibold text-white">{zone.name}</span>.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={onBackToZones}
              className="w-full rounded-2xl bg-white py-4 text-base font-bold text-slate-950 active:scale-[0.98]"
            >
              Volver a mis zonas
            </button>
            <button
              type="button"
              onClick={onRestartRoute}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800/80 py-3.5 text-sm font-semibold text-slate-200 active:scale-[0.98]"
            >
              <RotateCcw className="h-4 w-4" />
              Reiniciar esta ruta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0B0F17] text-white">
      {/* Mapa protagonista estilo Google Maps */}
      <section className="relative flex-1 min-h-[45%] w-full">
        <RouteMap
          zone={zone}
          currentIndex={progress.currentIndex}
          driverPosition={position}
          gpsError={gpsError}
        />

        {/* Chip discreto offline si no hay conexión */}
        {!isOnline && (
          <div className="pointer-events-none absolute left-3 bottom-4 z-[400] flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-amber-300 shadow">
            <WifiOff className="h-3.5 w-3.5" />
            Offline
          </div>
        )}
      </section>

      {/* Bottom Sheet nativo limpio */}
      <section className="relative z-10 -mt-4 flex shrink-0 flex-col rounded-t-[26px] bg-[#111622] px-5 pb-5 pt-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
        {/* Tirador superior sutil */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />

        {/* Cabecera compacta del sheet: zona, parada y ajustes */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-xs font-semibold text-slate-400">{zone.name}</span>
            <span className="text-slate-600">·</span>
            <span className="shrink-0 text-xs font-bold text-white">
              Parada {progress.currentIndex + 1} de {totalStops}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-300 active:bg-white/10"
            aria-label="Ajustes"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {/* Barra de progreso fina */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-[#4285F4] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Datos del destino actual */}
        {currentStop ? (
          <div className="mt-3.5 space-y-3">
            <h2 className="text-[21px] font-bold leading-snug tracking-tight text-white">
              {currentStop.address}
            </h2>

            {/* Periódicos */}
            <div className="flex flex-wrap gap-1.5">
              {currentStop.newspapers.length > 0 ? (
                currentStop.newspapers.map((paper, idx) => (
                  <span
                    key={`${paper}-${idx}`}
                    className="rounded-lg bg-amber-400/15 px-2.5 py-1 text-sm font-bold text-amber-300"
                  >
                    {paper}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">Sin periódicos especificados</span>
              )}
            </div>

            {/* Observación con barra lateral limpia */}
            {currentStop.notes && (
              <div className="border-l-2 border-[#4285F4] pl-3 py-0.5">
                <p className="text-sm font-medium leading-snug text-slate-200">
                  {currentStop.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-slate-400">No hay paradas en esta zona.</div>
        )}

        {/* Controles ergonómicos de conducción */}
        <div className="mt-5 grid grid-cols-12 gap-2.5">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            className="col-span-3 flex h-14 items-center justify-center rounded-2xl bg-slate-800/90 text-white active:scale-95 disabled:opacity-30"
            aria-label="Parada anterior"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={onSpeak}
            className="col-span-3 flex h-14 items-center justify-center rounded-2xl bg-slate-800/90 text-[#60A5FA] active:scale-95"
            aria-label="Repetir voz"
          >
            <Volume2 className="h-6 w-6" />
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onFinishRoute}
              className="col-span-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-base active:scale-95"
            >
              <Flag className="h-5 w-5" />
              Finalizar
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="col-span-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#1A73E8] text-white font-bold text-base shadow-lg shadow-blue-950/40 active:scale-95"
            >
              Siguiente
              <ArrowRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
