import {
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { SyncProgress, Zone, ZoneProgress } from '../types';

interface ZoneSelectorProps {
  driverName: string;
  zones: Zone[];
  progressMap: Record<string, ZoneProgress>;
  isOnline: boolean;
  lastSync: number | null;
  syncProgress: SyncProgress;
  onSelectZone: (zone: Zone) => void;
  onSyncNow: () => void;
  onOpenSettings: () => void;
}

function formatSyncTime(ts: number | null): string {
  if (!ts) return 'Sin sincronizar';
  const d = new Date(ts);
  return `Actualizado ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

export function ZoneSelector({
  driverName,
  zones,
  progressMap,
  isOnline,
  lastSync,
  syncProgress,
  onSelectZone,
  onSyncNow,
  onOpenSettings,
}: ZoneSelectorProps) {
  const isSyncing =
    syncProgress.stage !== 'idle' &&
    syncProgress.stage !== 'done' &&
    syncProgress.stage !== 'error';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#060606] text-white">
      {/* Cabecera corporativa Negro + Dorado */}
      <header className="sticky top-0 z-20 border-b border-[#D4AF37]/15 bg-black/95 px-5 pb-4 pt-4 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="./logo-msv.png"
              alt="MSV"
              className="h-11 w-16 shrink-0 rounded-lg border border-[#D4AF37]/30 bg-black object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[#E5C158]">{driverName}</p>
              <h1 className="truncate text-xl font-bold tracking-tight text-white">
                Zonas de reparto
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSyncNow}
              disabled={!isOnline || isSyncing}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141414] text-[#E5C158] ring-1 ring-[#D4AF37]/30 active:scale-95 disabled:opacity-35"
              aria-label="Sincronizar ahora"
              title="Sincronizar ahora"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141414] text-neutral-200 ring-1 ring-white/10 active:scale-95"
              aria-label="Ajustes"
              title="Ajustes"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Estado discreto de red */}
        <div className="mx-auto mt-3 flex max-w-xl items-center justify-between text-xs text-neutral-400">
          <span className="inline-flex items-center gap-1.5 font-medium">
            {isOnline ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">En línea</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-[#E5C158]" />
                <span className="text-[#E5C158]">Modo offline · Datos locales</span>
              </>
            )}
          </span>
          <span>{formatSyncTime(lastSync)}</span>
        </div>

        {syncProgress.stage !== 'idle' && (
          <div className="mx-auto mt-3 max-w-xl rounded-2xl bg-[#111111] p-3 ring-1 ring-[#D4AF37]/25">
            <div className="flex items-center justify-between text-xs font-medium">
              <span
                className={
                  syncProgress.stage === 'error'
                    ? 'text-rose-400'
                    : syncProgress.stage === 'done'
                      ? 'text-emerald-400'
                      : 'text-[#F3DC8B]'
                }
              >
                {syncProgress.message}
              </span>
              {isSyncing && <span className="text-neutral-400">{syncProgress.percent}%</span>}
            </div>
            {isSyncing && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-gradient-to-r from-[#F3DC8B] to-[#D4AF37] transition-all duration-300"
                  style={{ width: `${syncProgress.percent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </header>

      {/* Lista de zonas */}
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-2.5 px-5 pb-8 pt-4">
        {zones.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-[#111111] p-8 text-center ring-1 ring-[#D4AF37]/20">
            <p className="text-base font-semibold text-neutral-200">Sin zonas disponibles</p>
            <p className="mt-1 text-sm text-neutral-400">
              Conecta tu Google Sheet en Ajustes y pulsa sincronizar.
            </p>
          </div>
        ) : (
          zones.map((zone) => {
            const prog = progressMap[zone.id];
            const total = zone.stops.length;
            const current = prog ? Math.min(prog.currentIndex + 1, total) : 0;
            const isCompleted = prog?.completed ?? false;
            const km = zone.route ? (zone.route.distanceMeters / 1000).toFixed(1) : null;

            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => onSelectZone(zone)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl bg-[#111111] px-4 py-4 text-left ring-1 ring-[#D4AF37]/20 transition active:scale-[0.98] active:bg-[#191919] active:ring-[#D4AF37]/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-white">{zone.name}</h2>
                    {isCompleted && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                    <span>
                      {total} {total === 1 ? 'parada' : 'paradas'}
                    </span>
                    {km && (
                      <>
                        <span>·</span>
                        <span>{km} km</span>
                      </>
                    )}
                    {prog && !isCompleted && current > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-semibold text-[#E5C158]">
                          Parada {current}/{total}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 shrink-0 text-[#D4AF37]" />
              </button>
            );
          })
        )}
      </main>
    </div>
  );
}
