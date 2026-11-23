import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Flag,
  MapPin,
  MessageSquareText,
  Newspaper,
  RotateCcw,
  Settings,
  Volume2,
  Wifi,
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

  if (progress.completed) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-950 px-6 py-10 text-white">
        <div className="w-full max-w-md rounded-3xl border border-emerald-500/40 bg-surface-900 p-7 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">¡Ruta finalizada!</h2>
          <p className="mt-2 text-base text-slate-300">
            Has completado las <span className="font-bold text-white">{totalStops} paradas</span> de{' '}
            <span className="font-bold text-brand-400">{zone.name}</span>.
          </p>

          <div className="mt-7 flex flex-col gap-3">
            <button
              type="button"
              onClick={onBackToZones}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 text-lg font-extrabold text-surface-950 active:scale-[0.98]"
            >
              Volver al selector de zonas
            </button>
            <button
              type="button"
              onClick={onRestartRoute}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-surface-800 py-4 text-base font-bold text-white active:scale-[0.98]"
            >
              <RotateCcw className="h-5 w-5" />
              Reiniciar esta ruta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface-950 text-white">
      {/* Barra superior compacta */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-surface-950 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-extrabold text-white">{zone.name}</span>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              isOnline
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-surface-800 px-2.5 py-1 text-xs font-extrabold text-brand-400">
            Parada {progress.currentIndex + 1} de {totalStops}
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-surface-800 text-white active:scale-95"
            aria-label="Abrir ajustes"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mitad superior: Mapa interactivo estilo navegación */}
      <section className="relative h-[44%] min-h-[210px] w-full shrink-0 border-b border-slate-800">
        <RouteMap
          zone={zone}
          currentIndex={progress.currentIndex}
          driverPosition={position}
          gpsError={gpsError}
        />
      </section>

      {/* Mitad inferior: Panel de destino y controles de conducción */}
      <section className="flex flex-1 flex-col justify-between overflow-y-auto bg-surface-950 px-4 pb-4 pt-3">
        {currentStop ? (
          <div className="space-y-3">
            {/* Dirección exacta */}
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-1 h-6 w-6 shrink-0 text-brand-400" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Destino actual
                </p>
                <h2 className="text-xl font-extrabold leading-snug text-white sm:text-2xl">
                  {currentStop.address}
                </h2>
              </div>
            </div>

            {/* Periódicos del destino */}
            <div className="rounded-2xl border border-slate-800 bg-surface-900 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Newspaper className="h-4 w-4 text-brand-400" />
                Periódicos a entregar
              </div>
              <div className="flex flex-wrap gap-2">
                {currentStop.newspapers.length > 0 ? (
                  currentStop.newspapers.map((paper, idx) => (
                    <span
                      key={`${paper}-${idx}`}
                      className="rounded-xl bg-brand-500/20 px-3 py-1.5 text-base font-extrabold text-brand-400 border border-brand-500/40"
                    >
                      {paper}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">Sin periódicos especificados</span>
                )}
              </div>
            </div>

            {/* Observaciones / Comentario */}
            <div className="rounded-2xl border border-sky-500/30 bg-sky-950/40 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-300">
                <MessageSquareText className="h-4 w-4" />
                Observación
              </div>
              <p className="text-base font-bold leading-snug text-white">
                {currentStop.notes || 'Sin observaciones adicionales.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400">No hay paradas en esta zona.</div>
        )}

        {/* Controles táctiles grandes para conducción */}
        <div className="mt-4 grid grid-cols-12 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            className="col-span-3 flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-700 bg-surface-800 text-white shadow active:scale-95 disabled:opacity-35"
            aria-label="Parada anterior"
          >
            <ArrowLeft className="h-6 w-6" />
            <span className="text-xs font-bold">Volver</span>
          </button>

          <button
            type="button"
            onClick={onSpeak}
            className="col-span-3 flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-sky-500/50 bg-sky-500/20 text-sky-300 shadow active:scale-95"
            aria-label="Repetir voz"
          >
            <Volume2 className="h-6 w-6" />
            <span className="text-xs font-bold">Voz</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onFinishRoute}
              className="col-span-6 flex h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-surface-950 shadow-lg active:scale-95"
            >
              <Flag className="h-6 w-6" />
              <span className="text-lg font-extrabold">Finalizar ruta</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="col-span-6 flex h-16 items-center justify-center gap-2 rounded-2xl bg-brand-500 text-surface-950 shadow-lg active:scale-95"
            >
              <span className="text-lg font-extrabold">Siguiente</span>
              <ArrowRight className="h-6 w-6" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
