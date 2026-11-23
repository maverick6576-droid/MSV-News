import {
  CheckCircle2,
  ChevronRight,
  MapPin,
  Newspaper,
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
  if (!ts) return 'Datos precargados';
  const d = new Date(ts);
  return `Sincronizado ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
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
    <div className="flex min-h-[100dvh] flex-col bg-surface-950 text-white">
      {/* Cabecera */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-surface-950/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-surface-950">
              <Newspaper className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold leading-tight">MSV News</h1>
              <p className="text-xs text-slate-400">Hola, {driverName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSyncNow}
              disabled={!isOnline || isSyncing}
              className="flex h-11 items-center gap-2 rounded-xl border border-slate-700 bg-surface-800 px-3 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
              aria-label="Sincronizar ahora"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-brand-400' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-surface-800 text-white active:scale-95"
              aria-label="Ajustes"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Estado de red y última sincronización */}
        <div className="mx-auto mt-3 flex max-w-2xl items-center justify-between rounded-xl bg-surface-900 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 font-semibold">
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-amber-400" />
                <span className="text-amber-300">Offline · Datos guardados</span>
              </>
            )}
          </div>
          <span className="text-slate-400">{formatSyncTime(lastSync)}</span>
        </div>

        {/* Barra de progreso de sincronización */}
        {syncProgress.stage !== 'idle' && (
          <div className="mx-auto mt-2 max-w-2xl rounded-xl border border-slate-700 bg-surface-900 p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span
                className={
                  syncProgress.stage === 'error'
                    ? 'text-rose-400'
                    : syncProgress.stage === 'done'
                      ? 'text-emerald-400'
                      : 'text-brand-400'
                }
              >
                {syncProgress.message}
              </span>
              {isSyncing && <span className="text-slate-400">{syncProgress.percent}%</span>}
            </div>
            {isSyncing && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-800">
                <div
                  className="h-full bg-brand-500 transition-all duration-300"
                  style={{ width: `${syncProgress.percent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </header>

      {/* Lista de zonas */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Zonas de reparto ({zones.length})
          </h2>
        </div>

        {zones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-surface-900 p-8 text-center">
            <p className="text-base font-semibold text-slate-300">No hay zonas sincronizadas</p>
            <p className="mt-1 text-sm text-slate-500">
              Pulsa en Ajustes para conectar tu Google Sheet o sincroniza con conexión.
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
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-surface-900 p-5 text-left shadow-md transition active:scale-[0.98] active:border-brand-500"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-xl font-extrabold text-white">{zone.name}</h3>
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completada
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                      <MapPin className="h-4 w-4 text-brand-400" />
                      {total} {total === 1 ? 'parada' : 'paradas'}
                    </span>
                    {km && <span>· {km} km</span>}
                    {prog && !isCompleted && current > 0 && (
                      <span className="rounded-md bg-brand-500/20 px-2 py-0.5 text-xs font-bold text-brand-400">
                        En parada {current}/{total}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-surface-950">
                  <ChevronRight className="h-7 w-7" />
                </div>
              </button>
            );
          })
        )}
      </main>
    </div>
  );
}
