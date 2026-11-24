import { useMemo } from 'react';
import {
  CheckCircle2,
  ChevronRight,
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
  if (!ts) return 'Sin sincronizar';
  const d = new Date(ts);
  return `Actualizado ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

function getNewspaperCounts(stops: Zone['stops']): {
  items: Array<{ name: string; count: number }>;
  total: number;
} {
  const counts = new Map<string, { label: string; count: number }>();
  let total = 0;

  for (const stop of stops) {
    for (const raw of stop.newspapers) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(key, { label, count: 1 });
      }
      total += 1;
    }
  }

  const items = Array.from(counts.values())
    .map(({ label, count }) => ({ name: label, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

  return { items, total };
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

  const zoneSummaries = useMemo(
    () =>
      zones.map((zone) => ({
        zone,
        summary: getNewspaperCounts(zone.stops),
      })),
    [zones]
  );

  const globalSummary = useMemo(() => {
    const allStops = zones.flatMap((z) => z.stops);
    return getNewspaperCounts(allStops);
  }, [zones]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#060606] text-white">
      {/* Cabecera corporativa respetando la barra de estado del móvil */}
      <header className="safe-top sticky top-0 z-20 border-b border-[#D4AF37]/20 bg-black/95 px-4 pb-3.5 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="./logo-msv.png"
              alt="MSV"
              className="h-11 w-14 shrink-0 rounded-lg border border-[#D4AF37]/35 bg-black object-cover"
            />
            <div>
              <h1 className="whitespace-nowrap text-xl font-extrabold tracking-wide text-white">
                MSV <span className="text-[#E5C158]">NEWS</span>
              </h1>
              <p className="max-w-[160px] truncate text-xs font-medium text-neutral-400">
                {driverName}
              </p>
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141414] text-neutral-200 ring-1 ring-white/15 active:scale-95"
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

      {/* Contenido principal */}
      <main className="safe-bottom mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-4">
        {/* Resumen global de carga cuando hay varias zonas */}
        {zones.length > 1 && globalSummary.total > 0 && (
          <section className="rounded-2xl bg-[#111111] p-4 ring-1 ring-[#D4AF37]/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E5C158]">
                <Newspaper className="h-4 w-4" />
                Carga total ({zones.length} zonas)
              </div>
              <span className="rounded-full bg-[#D4AF37]/20 px-3 py-1 text-sm font-extrabold text-[#F3DC8B] tabular-nums">
                {globalSummary.total} uds
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {globalSummary.items.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-2 rounded-xl bg-black/80 px-3 py-2.5 ring-1 ring-white/10"
                >
                  <span className="truncate text-sm font-semibold text-neutral-100">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-lg font-extrabold text-[#F3DC8B] tabular-nums">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lista de zonas con desglose grande y claro de periódicos (preparado para 10+ tipos) */}
        {zones.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-[#111111] p-8 text-center ring-1 ring-[#D4AF37]/20">
            <p className="text-base font-semibold text-neutral-200">Sin zonas disponibles</p>
            <p className="mt-1 text-sm text-neutral-400">
              Conecta tu Google Sheet en Ajustes y pulsa sincronizar.
            </p>
          </div>
        ) : (
          zoneSummaries.map(({ zone, summary }) => {
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
                className="flex w-full flex-col gap-3.5 rounded-2xl bg-[#111111] p-4 text-left ring-1 ring-[#D4AF37]/25 transition active:scale-[0.99] active:bg-[#191919] active:ring-[#D4AF37]/60"
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-xl font-extrabold text-white">{zone.name}</h2>
                      {isCompleted && (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                      <span className="font-semibold text-neutral-200">
                        {total} {total === 1 ? 'parada' : 'paradas'}
                      </span>
                      <span>·</span>
                      <span className="font-bold text-[#E5C158]">
                        {summary.total} {summary.total === 1 ? 'periódico' : 'periódicos'}
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
                          <span className="font-semibold text-white">
                            Parada {current}/{total}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#F3DC8B]">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </div>

                {/* Cuadrícula de periódicos grande y clara (hasta 10+ tipos sin apelotonarse) */}
                {summary.items.length > 0 && (
                  <div className="grid w-full grid-cols-2 gap-2 border-t border-white/10 pt-3">
                    {summary.items.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between gap-2 rounded-xl bg-black/75 px-3 py-2.5 ring-1 ring-[#D4AF37]/20"
                      >
                        <span className="truncate text-sm font-semibold text-neutral-100">
                          {item.name}
                        </span>
                        <span className="shrink-0 rounded-md bg-[#D4AF37]/20 px-2 py-0.5 text-base font-extrabold text-[#F3DC8B] tabular-nums">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })
        )}
      </main>
    </div>
  );
}
