import { useCallback, useEffect, useState } from 'react';
import { DeliveryScreen } from './components/DeliveryScreen';
import { LoginScreen } from './components/LoginScreen';
import { SettingsModal } from './components/SettingsModal';
import { ZoneSelector } from './components/ZoneSelector';
import { DEMO_ZONES } from './data/demoData';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import {
  DEFAULT_SETTINGS,
  getAllProgress,
  getAllZones,
  getSession,
  getSettings,
  saveAllZones,
  saveSession,
  saveSettings,
  saveZoneProgress,
} from './services/db';
import { enrichZonesGeoAndRoutes } from './services/geo';
import { fetchZonesFromConfig } from './services/sheets';
import { speakStop, stopSpeaking } from './services/tts';
import type { AppSettings, DriverSession, SyncProgress, Zone, ZoneProgress } from './types';

export default function App() {
  const isOnline = useNetworkStatus();
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<DriverSession | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [zones, setZones] = useState<Zone[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ZoneProgress>>({});
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    stage: 'idle',
    message: '',
    percent: 0,
  });

  // Cargar datos locales desde IndexedDB al iniciar (funciona 100% sin Wi-Fi)
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [savedSession, savedSettings, savedZones, savedProgress] = await Promise.all([
          getSession(),
          getSettings(),
          getAllZones(),
          getAllProgress(),
        ]);

        if (cancelled) return;

        setSession(savedSession);
        setSettings(savedSettings);
        setProgressMap(savedProgress);

        if (savedZones.length > 0) {
          setZones(savedZones);
        } else {
          // Precarga inicial de zonas demo para funcionamiento inmediato sin internet
          await saveAllZones(DEMO_ZONES);
          setZones(DEMO_ZONES);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (driverName: string) => {
    const nextSession: DriverSession = {
      driverName,
      loggedInAt: Date.now(),
    };
    setSession(nextSession);
    await saveSession(nextSession);
  };

  const handleUpdateSettings = async (next: AppSettings) => {
    setSettings(next);
    await saveSettings(next);
  };

  const handleSyncNow = useCallback(
    async (overrideSettings?: AppSettings) => {
      const cfg = overrideSettings ?? settings;
      if (!navigator.onLine) {
        setSyncProgress({
          stage: 'error',
          message: 'Sin conexión. Se mantienen los datos guardados offline.',
          percent: 0,
        });
        return;
      }

      try {
        setSyncProgress({
          stage: 'fetching_sheets',
          message: 'Descargando zonas desde Google Sheets...',
          percent: 10,
        });

        const rawZones = await fetchZonesFromConfig(cfg.sheet);
        const enriched = await enrichZonesGeoAndRoutes(
          rawZones,
          cfg.sheet.cityHint,
          setSyncProgress
        );

        await saveAllZones(enriched);
        setZones(enriched);

        const updatedSettings: AppSettings = {
          ...cfg,
          lastGlobalSync: Date.now(),
        };
        setSettings(updatedSettings);
        await saveSettings(updatedSettings);

        setTimeout(() => {
          setSyncProgress({ stage: 'idle', message: '', percent: 0 });
        }, 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al sincronizar.';
        setSyncProgress({
          stage: 'error',
          message: msg,
          percent: 0,
        });
      }
    },
    [settings]
  );

  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;

  const ensureProgress = async (zone: Zone): Promise<ZoneProgress> => {
    const existing = progressMap[zone.id];
    if (existing) {
      const safeIndex = Math.min(existing.currentIndex, Math.max(0, zone.stops.length - 1));
      if (safeIndex !== existing.currentIndex) {
        const fixed = { ...existing, currentIndex: safeIndex };
        setProgressMap((prev) => ({ ...prev, [zone.id]: fixed }));
        await saveZoneProgress(fixed);
        return fixed;
      }
      return existing;
    }

    const fresh: ZoneProgress = {
      zoneId: zone.id,
      currentIndex: 0,
      completed: false,
      startedAt: Date.now(),
      completedAt: null,
    };
    setProgressMap((prev) => ({ ...prev, [zone.id]: fresh }));
    await saveZoneProgress(fresh);
    return fresh;
  };

  const handleSelectZone = async (zone: Zone) => {
    const prog = await ensureProgress(zone);
    setActiveZoneId(zone.id);
    if (!prog.completed && zone.stops[prog.currentIndex]) {
      speakStop(zone.stops[prog.currentIndex], settings.voice);
    }
  };

  const updateActiveProgress = async (nextProg: ZoneProgress, shouldSpeakStopIndex?: number) => {
    setProgressMap((prev) => ({ ...prev, [nextProg.zoneId]: nextProg }));
    await saveZoneProgress(nextProg);

    if (
      shouldSpeakStopIndex !== undefined &&
      activeZone &&
      activeZone.stops[shouldSpeakStopIndex]
    ) {
      speakStop(activeZone.stops[shouldSpeakStopIndex], settings.voice);
    }
  };

  const handleNextStop = async () => {
    if (!activeZone) return;
    const prog = progressMap[activeZone.id];
    if (!prog) return;
    const nextIdx = Math.min(prog.currentIndex + 1, activeZone.stops.length - 1);
    if (nextIdx === prog.currentIndex) return;
    await updateActiveProgress({ ...prog, currentIndex: nextIdx }, nextIdx);
  };

  const handlePrevStop = async () => {
    if (!activeZone) return;
    const prog = progressMap[activeZone.id];
    if (!prog) return;
    const prevIdx = Math.max(prog.currentIndex - 1, 0);
    if (prevIdx === prog.currentIndex) return;
    await updateActiveProgress({ ...prog, currentIndex: prevIdx }, prevIdx);
  };

  const handleRepeatSpeak = () => {
    if (!activeZone) return;
    const prog = progressMap[activeZone.id];
    const stop = prog ? activeZone.stops[prog.currentIndex] : undefined;
    if (stop) {
      speakStop(stop, settings.voice, true);
    }
  };

  const handleFinishRoute = async () => {
    if (!activeZone) return;
    stopSpeaking();
    const prog = progressMap[activeZone.id];
    if (!prog) return;
    await updateActiveProgress({
      ...prog,
      completed: true,
      completedAt: Date.now(),
    });
  };

  const handleRestartRoute = async () => {
    if (!activeZone) return;
    stopSpeaking();
    const reset: ZoneProgress = {
      zoneId: activeZone.id,
      currentIndex: 0,
      completed: false,
      startedAt: Date.now(),
      completedAt: null,
    };
    await updateActiveProgress(reset, 0);
  };

  const handleBackToZones = () => {
    stopSpeaking();
    setActiveZoneId(null);
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface-950 text-brand-400 font-bold">
        Cargando MSV News...
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const isSyncing =
    syncProgress.stage !== 'idle' &&
    syncProgress.stage !== 'done' &&
    syncProgress.stage !== 'error';

  const activeProgress = activeZone ? progressMap[activeZone.id] : undefined;

  return (
    <>
      {activeZone && activeProgress ? (
        <DeliveryScreen
          zone={activeZone}
          progress={activeProgress}
          isOnline={isOnline}
          onNext={handleNextStop}
          onPrev={handlePrevStop}
          onSpeak={handleRepeatSpeak}
          onFinishRoute={handleFinishRoute}
          onRestartRoute={handleRestartRoute}
          onBackToZones={handleBackToZones}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <ZoneSelector
          driverName={session.driverName}
          zones={zones}
          progressMap={progressMap}
          isOnline={isOnline}
          lastSync={settings.lastGlobalSync}
          syncProgress={syncProgress}
          onSelectZone={handleSelectZone}
          onSyncNow={() => handleSyncNow()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          hasActiveZone={Boolean(activeZone)}
          isOnline={isOnline}
          isSyncing={isSyncing}
          onClose={() => setSettingsOpen(false)}
          onUpdateSettings={handleUpdateSettings}
          onSyncNow={handleSyncNow}
          onBackToZones={activeZone ? handleBackToZones : undefined}
          onFinishRoute={activeZone ? handleFinishRoute : undefined}
          onRestartRoute={activeZone ? handleRestartRoute : undefined}
        />
      )}
    </>
  );
}
