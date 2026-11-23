import { DEMO_ZONES } from '../data/demoData';
import type { SheetConfig, Stop, Zone } from '../types';

export const APPS_SCRIPT_TEMPLATE = `function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var zones = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    var values = sheet.getDataRange().getValues();
    var rows = [];
    for (var r = 0; r < values.length; r++) {
      var addr = String(values[r][0] || '').trim();
      var papers = String(values[r][1] || '').trim();
      var notes = String(values[r][2] || '').trim();
      if (!addr) continue;
      // Saltar fila de cabecera si existe
      if (r === 0 && /direcci[oó]n|calle|address/i.test(addr)) continue;
      rows.push([addr, papers, notes]);
    }
    if (rows.length > 0) {
      zones.push({ name: name, rows: rows });
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ zones: zones }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

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

export function extractSheetId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
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

interface GvizCell {
  v?: string | number | null;
  f?: string | null;
}

interface GvizRow {
  c?: (GvizCell | null)[];
}

interface GvizResponse {
  table?: {
    rows?: GvizRow[];
  };
}

export function parseGvizText(text: string): [string, string, string][] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Respuesta no válida de Google Sheets (GViz).');
  }
  const json = JSON.parse(text.slice(start, end + 1)) as GvizResponse;
  const rows = json.table?.rows ?? [];
  const parsed: [string, string, string][] = [];

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]?.c ?? [];
    const colA = String(cells[0]?.f ?? cells[0]?.v ?? '').trim();
    const colB = String(cells[1]?.f ?? cells[1]?.v ?? '').trim();
    const colC = String(cells[2]?.f ?? cells[2]?.v ?? '').trim();
    if (!colA) continue;
    if (i === 0 && /direcci[oó]n|calle|address/i.test(colA)) continue;
    parsed.push([colA, colB, colC]);
  }

  return parsed;
}

interface AppsScriptPayload {
  zones?: Array<{
    name: string;
    rows: [string, string, string][];
  }>;
}

export async function fetchZonesFromConfig(config: SheetConfig): Promise<Zone[]> {
  if (config.mode === 'demo') {
    const now = Date.now();
    return DEMO_ZONES.map((z) => ({ ...z, syncedAt: now }));
  }

  if (config.mode === 'apps_script') {
    const url = config.appsScriptUrl.trim();
    if (!url) {
      throw new Error('Introduce la URL de tu Google Apps Script en Ajustes.');
    }
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Error al leer Apps Script (${res.status}). Verifica que el despliegue es público.`);
    }
    const data = (await res.json()) as AppsScriptPayload;
    if (!data.zones || !Array.isArray(data.zones) || data.zones.length === 0) {
      throw new Error('No se encontraron pestañas con paradas en la hoja.');
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

  // Modo public_sheet (sin Apps Script, usando GViz JSON)
  const sheetId = extractSheetId(config.sheetUrlOrId);
  if (!sheetId) {
    throw new Error('Introduce la URL o el ID de tu Google Sheet en Ajustes.');
  }

  const tabs = config.tabNames
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const tabList = tabs.length > 0 ? tabs : ['Hoja 1'];
  const now = Date.now();
  const zones: Zone[] = [];

  for (const tabName of tabList) {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      sheetId
    )}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(
        `No se pudo leer la pestaña "${tabName}" (${res.status}). Asegúrate de que la hoja sea pública (Cualquier persona con el enlace: Lector).`
      );
    }
    const text = await res.text();
    const rows = parseGvizText(text);
    if (rows.length > 0) {
      const id = slugifyZone(tabName);
      zones.push({
        id,
        name: tabName,
        stops: rowsToStops(id, rows),
        route: null,
        syncedAt: now,
      });
    }
  }

  if (zones.length === 0) {
    throw new Error('No se encontraron paradas válidas en las pestañas indicadas.');
  }

  return zones;
}
