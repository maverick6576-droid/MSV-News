import { describe, expect, it } from 'vitest';
import { haversineMeters } from '../geo';
import { parseNewspapersList, slugifyZone } from '../sheets';
import { buildStopSpeechMessage } from '../tts';
import type { Stop } from '../../types';

describe('MSV News core services', () => {
  it('slugifies zone tab names cleanly', () => {
    expect(slugifyZone('Zona Mataró')).toBe('zona-mataro');
    expect(slugifyZone('  Zona Norte 2  ')).toBe('zona-norte-2');
  });

  it('parses comma-separated newspapers cleanly', () => {
    expect(parseNewspapersList('La Vanguardia, El Mundo,  El Punt ')).toEqual([
      'La Vanguardia',
      'El Mundo',
      'El Punt',
    ]);
  });

  it('builds natural Spanish TTS messages with and without notes', () => {
    const withNotes: Stop = {
      id: '1',
      index: 0,
      address: 'La Riera, 12',
      newspapers: ['La Vanguardia', 'El Punt'],
      notes: 'Dejar por debajo de la puerta',
      lat: 41.54,
      lng: 2.44,
    };
    expect(buildStopSpeechMessage(withNotes)).toBe(
      'La Vanguardia y El Punt, y se dejan en Dejar por debajo de la puerta'
    );

    const withoutNotes: Stop = {
      ...withNotes,
      newspapers: ['El País'],
      notes: '   ',
    };
    expect(buildStopSpeechMessage(withoutNotes)).toBe('El País, en La Riera, 12');
  });

  it('calculates haversine distance accurately', () => {
    const d = haversineMeters([41.3856, 2.1652], [41.3894, 2.1665]);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(500);
  });
});
