import { useCallback, useEffect, useRef, useState } from 'react';
import { DeliveryScreen } from './components/DeliveryScreen';
import { LoginScreen } from './components/LoginScreen';
import { SettingsModal } from './components/SettingsModal';
import { ZoneSelector } from './components/ZoneSelector';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import {
  DEFAULT_SETTINGS,
  getActiveZoneId,
  getAllProgress,
  getAllZones,
  getSession,
  getSettings,
  saveActiveZoneId,
  saveAllZones,
  saveSession,
  saveSettings,
  saveZoneProgress,
} from './services/db';
import { enrichZonesGeoAndRoutes, geocodeAddress } from './services/geo';
import { fetchZonesFromFixedSheet } from './services/sheets';
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
  const autoSyncedRef = useRef(false);
  const zonesRef = useRef<Zone[]>([]);
  const priorityGeocodingRef = useRef<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    stage: 'idle',
    message: '',
    percent: 0,
  });

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  // Cargar datos locales + zona activa desde IndexedDB al iniciar (funciona 100% sin Wi-Fi)
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [savedSession, savedSettings, savedZones, savedProgress, savedActiveZoneId] =
          await Promise.all([
            getSession(),
            getSettings(),
            getAllZones(),
            getAllProgress(),
            getActiveZoneId(),
          ]);

        if (cancelled) return;

        setSession(savedSession);
        setSettings(savedSettings);
        setProgressMap(savedProgress);

        // Filtrar antiguas zonas demo si quedaron guardadas en dispositivos previos
        const realZones = savedZones.filter(
          (z) => z.id !== 'zona-centro' && z.id !== 'zona-ensanche' && z.id !== 'zona-puerto'
        );
        if (realZones.length !== savedZones.length) {
          await saveAllZones(realZones);
        }
        zonesRef.current = realZones;
        setZones(realZones);

        // Restaurar la zona donde estaba trabajando el conductor para no expulsarlo jamás al selector
        if (savedActiveZoneId && realZones.some((z) => z.id === savedActiveZoneId)) {
          setActiveZoneId(savedActiveZoneId);
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
          message: 'Actualizando hojas en segundo plano...',
          percent: 10,
        });

        const rawZones = await fetchZonesFromFixedSheet();
        const enriched = await enrichZonesGeoAndRoutes(
          rawZones,
          cfg.sheet.cityHint,
          setSyncProgress,
          (partialZones) => {
            zonesRef.current = partialZones;
            setZones(partialZones);
            void saveAllZones(partialZones);
          },
          zonesRef.current
        );

        zonesRef.current = enriched;
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

  // Auto-sincronizar en segundo plano al abrir la app si hay conexión (sin bloquear la operación)
  useEffect(() => {
    if (!hydrated || !isOnline || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    void handleSyncNow(settings);
  }, [hydrated, isOnline, handleSyncNow, settings]);

  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;
  const activeProgress = activeZone ? progressMap[activeZone.id] : undefined;

  // Asegurar que exista registro de progreso si se restauró una zona activa
  useEffect(() => {
    if (!activeZone || activeProgress) return;
    const fresh: ZoneProgress = {
      zoneId: activeZone.id,
      currentIndex: 0,
      completed: false,
      startedAt: Date.now(),
      completedAt: null,
    };
    setProgressMap((prev) => ({ ...prev, [activeZone.id]: fresh }));
    void saveZoneProgress(fresh);
  }, [activeZone, activeProgress]);

  // Geocodificación prioritaria inmediata si la parada actual todavía no tiene coordenadas
  const currentStop =
    activeZone && activeProgress ? activeZone.stops[activeProgress.currentIndex] : undefined;

  useEffect(() => {
    if (
      !activeZone ||
      !currentStop ||
      (currentStop.lat !== null && currentStop.lng !== null) ||
      !isOnline
    ) {
      return;
    }

    const key = `${activeZone.id}:${currentStop.id}`;
    if (priorityGeocodingRef.current === key) return;
    priorityGeocodingRef.current = key;

    let cancelled = false;
    geocodeAddress(currentStop.address, settings.sheet.cityHint)
      .then((coords) => {
        if (cancelled || !coords) return;
        setZones((prevZones) => {
          const updated = prevZones.map((z) => {
            if (z.id !== activeZone.id) return z;
            return {
              ...z,
              stops: z.stops.map((s) =>
                s.id === currentStop.id ? { ...s, lat: coords.lat, lng: coords.lng } : s
              ),
            };
          });
          zonesRef.current = updated;
          void saveAllZones(updated);
          return updated;
        });
      })
      .finally(() => {
        if (priorityGeocodingRef.current === key) {
          priorityGeocodingRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeZone, currentStop, isOnline, settings.sheet.cityHint]);

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
    await saveActiveZoneId(zone.id);
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

  const handleBackToZones = async () => {
    stopSpeaking();
    if (activeZoneId) {
      const reset: ZoneProgress = {
        zoneId: activeZoneId,
        currentIndex: 0,
        completed: false,
        startedAt: Date.now(),
        completedAt: null,
      };
      setProgressMap((prev) => ({ ...prev, [activeZoneId]: reset }));
      await saveZoneProgress(reset);
    }
    setActiveZoneId(null);
    await saveActiveZoneId(null);
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black text-[#E5C158] font-bold">
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
