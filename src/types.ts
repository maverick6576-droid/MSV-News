export interface Stop {
  id: string;
  index: number;
  address: string;
  newspapers: string[];
  notes: string;
  lat: number | null;
  lng: number | null;
}

export interface NavStep {
  instruction: string;
  maneuverType: string;
  maneuverModifier?: string;
  streetName: string;
  distanceMeters: number;
  location: [number, number]; // [lat, lng]
}

export interface ActiveNavigationRoute {
  coordinates: [number, number][]; // [lat, lng]
  distanceMeters: number;
  durationSeconds: number;
  steps: NavStep[];
  isFallback: boolean;
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lat, lng]
  distanceMeters: number;
  durationSeconds: number;
  isFallback: boolean;
}

export interface Zone {
  id: string;
  name: string;
  stops: Stop[];
  route: RouteGeometry | null;
  legs?: Record<string, ActiveNavigationRoute>;
  syncedAt: number;
}

export interface ZoneProgress {
  zoneId: string;
  currentIndex: number;
  completed: boolean;
  startedAt: number;
  completedAt: number | null;
}

export interface SheetConfig {
  cityHint: string; // Ciudad/país por defecto para mejorar geocodificación
}

export interface VoiceSettings {
  enabled: boolean;
  autoSpeak: boolean;
  rate: number; // 0.7 - 1.4
  volume: number; // 0 - 1
}

export interface DriverSession {
  driverName: string;
  loggedInAt: number;
}

export interface AppSettings {
  sheet: SheetConfig;
  voice: VoiceSettings;
  lastGlobalSync: number | null;
}

export interface SyncProgress {
  stage: 'idle' | 'fetching_sheets' | 'geocoding' | 'routing' | 'caching_tiles' | 'done' | 'error';
  message: string;
  percent: number;
}
