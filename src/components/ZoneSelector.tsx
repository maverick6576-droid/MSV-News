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
    <div className="flex min-h-[100dvh] flex-col bg-[#0B0F17] text-white">
      {/* Cabecera limpia estilo app nativa */}
      <header className="sticky top-0 z-20 bg-[#0B0F17]/95 px-5 pb-4 pt-5 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400">{driverName}</p>
            <h1 className="text-2xl font-bold tracking-tight text-white">Zonas de reparto</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSyncNow}
              disabled={!isOnline || isSyncing}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-200 ring-1 ring-white/10 active:scale-95 disabled:opacity-35"
              aria-label="Sincronizar ahora"
              title="Sincronizar ahora"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-[#4285F4]' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-200 ring-1 ring-white/10 active:scale-95"
              aria-label="Ajustes"
              title="Ajustes"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Estado discreto de red */}
        <div className="mx-auto mt-3 flex max-w-xl items-center justify-between text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5 font-medium">
            {isOnline ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">En línea</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-300">Modo offline · Datos locales</span>
              </>
            )}
          </span>
          <span>{formatSyncTime(lastSync)}</span>
        </div>

        {syncProgress.stage !== 'idle' && (
          <div className="mx-auto mt-3 max-w-xl rounded-2xl bg-[#141B29] p-3 ring-1 ring-white/10">
            <div className="flex items-center justify-between text-xs font-medium">
              <span
                className={
                  syncProgress.stage === 'error'
                    ? 'text-rose-400'
                    : syncProgress.stage === 'done'
                      ? 'text-emerald-400'
                      : 'text-slate-200'
                }
              >
                {syncProgress.message}
              </span>
              {isSyncing && <span className="text-slate-400">{syncProgress.percent}%</span>}
            </div>
            {isSyncing && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-[#4285F4] transition-all duration-300"
                  style={{ width: `${syncProgress.percent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </header>

      {/* Lista de zonas */}
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-2.5 px-5 pb-8 pt-2">
        {zones.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-[#141B29] p-8 text-center ring-1 ring-white/5">
            <p className="text-base font-semibold text-slate-200">Sin zonas disponibles</p>
            <p className="mt-1 text-sm text-slate-400">
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
                className="flex w-full items-center justify-between gap-4 rounded-2xl bg-[#141B29] px-4 py-4 text-left ring-1 ring-white/5 transition active:scale-[0.98] active:bg-[#1B2436]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-white">{zone.name}</h2>
                    {isCompleted && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
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
                        <span className="font-semibold text-[#60A5FA]">
                          Parada {current}/{total}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />
              </button>
            );
          })
        )}
      </main>
    </div>
  );
}
