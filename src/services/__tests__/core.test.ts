import { describe, expect, it } from 'vitest';
import { haversineMeters } from '../geo';
import { extractSheetId, parseGvizText, parseNewspapersList } from '../sheets';
import { buildStopSpeechMessage } from '../tts';
import type { Stop } from '../../types';

describe('MSV News core services', () => {
  it('extracts Google Sheet ID from full URL or raw ID', () => {
    expect(
      extractSheetId('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0')
    ).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(extractSheetId('1AbCdEfGhIjKlMnOpQrStUvWxYz')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
  });

  it('parses comma-separated newspapers cleanly', () => {
    expect(parseNewspapersList('La Vanguardia, El Mundo,  Sport ')).toEqual([
      'La Vanguardia',
      'El Mundo',
      'Sport',
    ]);
  });

  it('parses GViz JSONP response and skips header row', () => {
    const sample = `/*O_o*/\ngoogle.visualization.Query.setResponse({"table":{"rows":[{"c":[{"v":"Dirección"},{"v":"Periódicos"},{"v":"Observación"}]},{"c":[{"v":"Calle Mayor 10, 2º"},{"v":"La Vanguardia, El Mundo"},{"v":"Dejar por debajo de la puerta"}]}]}});`;
    const rows = parseGvizText(sample);
    expect(rows).toEqual([
      ['Calle Mayor 10, 2º', 'La Vanguardia, El Mundo', 'Dejar por debajo de la puerta'],
    ]);
  });

  it('builds natural Spanish TTS messages with and without notes', () => {
    const withNotes: Stop = {
      id: '1',
      index: 0,
      address: 'Calle Pelai 12',
      newspapers: ['La Vanguardia', 'El Mundo'],
      notes: 'Dejar por debajo de la puerta',
      lat: 41.38,
      lng: 2.16,
    };
    expect(buildStopSpeechMessage(withNotes)).toBe(
      'La Vanguardia y El Mundo, y se dejan en Dejar por debajo de la puerta'
    );

    const withoutNotes: Stop = {
      ...withNotes,
      newspapers: ['El País'],
      notes: '   ',
    };
    expect(buildStopSpeechMessage(withoutNotes)).toBe('El País, en Calle Pelai 12');
  });

  it('calculates haversine distance accurately', () => {
    const d = haversineMeters([41.3856, 2.1652], [41.3894, 2.1665]);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(500);
  });
});
