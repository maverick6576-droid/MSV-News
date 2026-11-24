import { describe, expect, it } from 'vitest';
import {
  cleanSpanishAddress,
  distanceToPolylineMeters,
  haversineMeters,
  sliceRouteFromDriver,
} from '../geo';
import { parseNewspapersList, slugifyZone } from '../sheets';
import { buildStopSpeechMessage } from '../tts';
import type { ActiveNavigationRoute, Stop } from '../../types';

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

  it('cleans Spanish and Catalan addresses with abbreviations and floors', () => {
    expect(cleanSpanishAddress('La Riera, 12, 1º 1ª')).toEqual({
      streetAndNumber: 'La Riera 12',
      streetOnly: 'La Riera',
    });
    expect(cleanSpanishAddress('C/ Balmes 48 4º 2ª')).toEqual({
      streetAndNumber: 'Carrer Balmes 48',
      streetOnly: 'Carrer Balmes',
    });
    expect(cleanSpanishAddress('Av. Puig i Cadafalch, 110, Bajo')).toEqual({
      streetAndNumber: 'Avinguda Puig i Cadafalch 110',
      streetOnly: 'Avinguda Puig i Cadafalch',
    });
    expect(cleanSpanishAddress('Pl. de Cuba, 8, Local 2')).toEqual({
      streetAndNumber: 'Plaça de Cuba 8',
      streetOnly: 'Plaça de Cuba',
    });
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

  it('calculates haversine and polyline distances accurately', () => {
    const d = haversineMeters([41.3856, 2.1652], [41.3894, 2.1665]);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(500);

    const polyDist = distanceToPolylineMeters(
      [41.5381, 2.4447],
      [
        [41.5381, 2.4447],
        [41.54, 2.445],
      ]
    );
    expect(polyDist).toBe(0);
  });

  it('slices a precomputed route so it always starts at the driver location', () => {
    const route: ActiveNavigationRoute = {
      coordinates: [
        [41.538, 2.444],
        [41.539, 2.445],
        [41.54, 2.446],
        [41.541, 2.447],
      ],
      distanceMeters: 450,
      durationSeconds: 90,
      steps: [],
      isFallback: false,
    };
    const driverPos: [number, number] = [41.5391, 2.4451];
    const sliced = sliceRouteFromDriver(route, driverPos);
    expect(sliced.coordinates[0]).toEqual(driverPos);
    expect(sliced.coordinates).toHaveLength(3);
    expect(sliced.coordinates[sliced.coordinates.length - 1]).toEqual([41.541, 2.447]);
  });
});
