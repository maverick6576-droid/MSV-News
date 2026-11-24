import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { FIXED_DATABASE } from '../config/database';
import type { AppSettings, DriverSession, RouteGeometry, Zone, ZoneProgress } from '../types';

interface MsvNewsDB extends DBSchema {
  zones: {
    key: string;
    value: Zone;
  };
  progress: {
    key: string;
    value: ZoneProgress;
  };
  geocodeCache: {
    key: string;
    value: {
      query: string;
      lat: number;
      lng: number;
      cachedAt: number;
    };
  };
  routeCache: {
    key: string;
    value: {
      key: string;
      route: RouteGeometry;
      cachedAt: number;
    };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'msv-news-offline-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MsvNewsDB>> | null = null;

function getDb(): Promise<IDBPDatabase<MsvNewsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MsvNewsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('zones')) {
          db.createObjectStore('zones', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'zoneId' });
        }
        if (!db.objectStoreNames.contains('geocodeCache')) {
          db.createObjectStore('geocodeCache', { keyPath: 'query' });
        }
        if (!db.objectStoreNames.contains('routeCache')) {
          db.createObjectStore('routeCache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sheet: {
    cityHint: FIXED_DATABASE.defaultCityHint,
  },
  voice: {
    enabled: true,
    autoSpeak: true,
    rate: 1.0,
    volume: 1.0,
  },
  lastGlobalSync: null,
};

export async function getAllZones(): Promise<Zone[]> {
  const db = await getDb();
  return db.getAll('zones');
}

export async function saveAllZones(zones: Zone[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('zones', 'readwrite');
  await tx.store.clear();
  for (const z of zones) {
    await tx.store.put(z);
  }
  await tx.done;
}

export async function getZoneProgress(zoneId: string): Promise<ZoneProgress | undefined> {
  const db = await getDb();
  return db.get('progress', zoneId);
}

export async function getAllProgress(): Promise<Record<string, ZoneProgress>> {
  const db = await getDb();
  const list = await db.getAll('progress');
  const map: Record<string, ZoneProgress> = {};
  for (const item of list) {
    map[item.zoneId] = item;
  }
  return map;
}

export async function saveZoneProgress(progress: ZoneProgress): Promise<void> {
  const db = await getDb();
  await db.put('progress', progress);
}

export async function getCachedGeocode(
  normalizedQuery: string
): Promise<{ lat: number; lng: number } | null> {
  const db = await getDb();
  const item = await db.get('geocodeCache', normalizedQuery);
  return item ? { lat: item.lat, lng: item.lng } : null;
}

export async function setCachedGeocode(
  normalizedQuery: string,
  lat: number,
  lng: number
): Promise<void> {
  const db = await getDb();
  await db.put('geocodeCache', {
    query: normalizedQuery,
    lat,
    lng,
    cachedAt: Date.now(),
  });
}

export async function getCachedRoute(key: string): Promise<RouteGeometry | null> {
  const db = await getDb();
  const item = await db.get('routeCache', key);
  return item ? item.route : null;
}

export async function setCachedRoute(key: string, route: RouteGeometry): Promise<void> {
  const db = await getDb();
  await db.put('routeCache', {
    key,
    route,
    cachedAt: Date.now(),
  });
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const saved = (await db.get('meta', 'settings')) as AppSettings | undefined;
  if (!saved) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    sheet: { ...DEFAULT_SETTINGS.sheet, ...(saved.sheet ?? {}) },
    voice: { ...DEFAULT_SETTINGS.voice, ...(saved.voice ?? {}) },
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('meta', settings, 'settings');
}

export async function getSession(): Promise<DriverSession | null> {
  const db = await getDb();
  const saved = (await db.get('meta', 'session')) as DriverSession | undefined;
  return saved ?? null;
}

export async function saveSession(session: DriverSession | null): Promise<void> {
  const db = await getDb();
  if (!session) {
    await db.delete('meta', 'session');
  } else {
    await db.put('meta', session, 'session');
  }
}

export async function getActiveZoneId(): Promise<string | null> {
  const db = await getDb();
  const saved = (await db.get('meta', 'activeZoneId')) as string | undefined;
  return saved ?? null;
}

export async function saveActiveZoneId(zoneId: string | null): Promise<void> {
  const db = await getDb();
  if (!zoneId) {
    await db.delete('meta', 'activeZoneId');
  } else {
    await db.put('meta', zoneId, 'activeZoneId');
  }
}
