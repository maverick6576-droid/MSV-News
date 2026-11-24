import { FIXED_DATABASE } from '../config/database';
import type { Stop, Zone } from '../types';

export function slugifyZone(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'zona'
  );
}

export function parseNewspapersList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowsToStops(zoneId: string, rows: [string, string, string][]): Stop[] {
  return rows
    .filter(([addr]) => addr && addr.trim().length > 0)
    .map(([address, papers, notes], index) => ({
      id: `${zoneId}-${index + 1}`,
      index,
      address: address.trim(),
      newspapers: parseNewspapersList(papers || ''),
      notes: (notes || '').trim(),
      lat: null,
      lng: null,
    }));
}

interface AppsScriptPayload {
  zones?: Array<{
    name: string;
    rows: [string, string, string][];
  }>;
}

export async function fetchZonesFromFixedSheet(): Promise<Zone[]> {
  const res = await fetch(FIXED_DATABASE.appsScriptUrl, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Error al leer la base de datos (${res.status}).`);
  }

  const data = (await res.json()) as AppsScriptPayload;
  if (!data.zones || !Array.isArray(data.zones) || data.zones.length === 0) {
    throw new Error('No se encontraron hojas con paradas en la Google Sheet.');
  }

  const now = Date.now();
  return data.zones.map((z) => {
    const id = slugifyZone(z.name);
    return {
      id,
      name: z.name,
      stops: rowsToStops(id, z.rows),
      route: null,
      syncedAt: now,
    };
  });
}
