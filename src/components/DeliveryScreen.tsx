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
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-6 py-10 text-white">
        <div className="w-full max-w-sm text-center">
          <img
            src="./logo-msv.png"
            alt="Missatgers Sant Valentí"
            className="mx-auto mb-6 h-16 w-auto rounded-xl border border-[#D4AF37]/30 object-contain"
          />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Ruta completada</h2>
          <p className="mt-2 text-sm text-neutral-400">
            {totalStops} paradas entregadas en{' '}
            <span className="font-semibold text-[#E5C158]">{zone.name}</span>.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={onBackToZones}
              className="w-full rounded-2xl bg-gradient-to-r from-[#F3DC8B] via-[#D4AF37] to-[#B8860B] py-4 text-base font-extrabold text-black active:scale-[0.98]"
            >
              Volver a mis zonas
            </button>
            <button
              type="button"
              onClick={onRestartRoute}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#141414] py-3.5 text-sm font-semibold text-neutral-200 ring-1 ring-white/10 active:scale-[0.98]"
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black text-white">
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
          <div className="pointer-events-none absolute left-3 bottom-4 z-[400] flex items-center gap-1.5 rounded-full bg-black/90 px-3 py-1.5 text-xs font-semibold text-[#E5C158] ring-1 ring-[#D4AF37]/40 shadow">
            <WifiOff className="h-3.5 w-3.5" />
            Offline
          </div>
        )}
      </section>

      {/* Bottom Sheet corporativo Negro + Dorado */}
      <section className="relative z-10 -mt-4 flex shrink-0 flex-col rounded-t-[26px] bg-[#0C0C0C] px-5 pb-5 pt-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] ring-1 ring-[#D4AF37]/25">
        {/* Tirador superior */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D4AF37]/40" />

        {/* Cabecera compacta del sheet */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-xs font-semibold text-neutral-400">{zone.name}</span>
            <span className="text-neutral-600">·</span>
            <span className="shrink-0 text-xs font-bold text-[#E5C158]">
              Parada {progress.currentIndex + 1} de {totalStops}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#181818] text-neutral-200 ring-1 ring-white/10 active:scale-95"
            aria-label="Ajustes"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {/* Barra de progreso dorada */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#F3DC8B] to-[#D4AF37] transition-all duration-300"
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
                    className="rounded-lg bg-[#D4AF37]/15 px-2.5 py-1 text-sm font-bold text-[#F3DC8B] ring-1 ring-[#D4AF37]/30"
                  >
                    {paper}
                  </span>
                ))
              ) : (
                <span className="text-sm text-neutral-500">Sin periódicos especificados</span>
              )}
            </div>

            {/* Observación con barra lateral dorada */}
            {currentStop.notes && (
              <div className="border-l-2 border-[#D4AF37] pl-3 py-0.5">
                <p className="text-sm font-medium leading-snug text-neutral-200">
                  {currentStop.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-neutral-400">No hay paradas en esta zona.</div>
        )}

        {/* Controles ergonómicos de conducción */}
        <div className="mt-5 grid grid-cols-12 gap-2.5">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            className="col-span-3 flex h-14 items-center justify-center rounded-2xl bg-[#181818] text-white ring-1 ring-white/10 active:scale-95 disabled:opacity-30"
            aria-label="Parada anterior"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={onSpeak}
            className="col-span-3 flex h-14 items-center justify-center rounded-2xl bg-[#181818] text-[#E5C158] ring-1 ring-[#D4AF37]/30 active:scale-95"
            aria-label="Repetir voz"
          >
            <Volume2 className="h-6 w-6" />
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onFinishRoute}
              className="col-span-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-black font-extrabold text-base active:scale-95"
            >
              <Flag className="h-5 w-5" />
              Finalizar
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="col-span-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F3DC8B] via-[#D4AF37] to-[#B8860B] text-black font-extrabold text-base shadow-lg shadow-[#D4AF37]/15 active:scale-95"
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
