import { describe, expect, it } from 'vitest';
import { liveUnavailable, mainErrorMessage, providerStatusMessage, rainfallProviderError, staleRainfall } from '../client/src/lib/utils/messages';
import type { ExposureAssessment } from '../client/src/lib/types/rainfall';

const now = Date.now();
function assessment(verified = false): ExposureAssessment {
  return {
    assessmentId: 'test', assessedAt: new Date(now).toISOString(), modelVersion: 'test',
    routes: [{ key: 'road', score: null, coverage: 0, distanceByClass: { LF: 0, MF: 0, HF: 0, VHF: 0, unclassified: 1 }, segments: [], reasons: [] }],
    recommendedKey: null, loggingStatus: 'disabled',
    hazards: { features: [], source: 'MGB', fetchedAt: new Date(now).toISOString(), verified },
    weather: { samples: [], errors: [] }
  };
}
const status = (data: ExposureAssessment | null, error = '', stale = false) => providerStatusMessage({ trafficSimulation: true, floodSimulation: false, trafficStatus: '', assessment: data, rainfallError: error, staleRainfall: stale });
const unavailable = (data: ExposureAssessment, stale = false) => liveUnavailable({ routeError: '', staleTraffic: false, staleRainfall: stale, floodSimulation: false, assessment: data, rainfallError: rainfallProviderError(data) });

describe('main travel rainfall status', () => {
  it('keeps pending verification informational and permits playback', () => {
    const data = assessment();
    expect(rainfallProviderError(data)).toBe('');
    expect(status(data)).toBe('MGB verification pending · exposure ranking unavailable.');
    expect(unavailable(data)).toBe(false);
  });
  it('keeps incomplete coverage informational', () => {
    const data = assessment(true);
    expect(status(data)).toBe('Route exposure assessment incomplete · flood conditions remain unconfirmed.');
    expect(unavailable(data)).toBe(false);
  });
  it.each(['weather', 'hazard', 'both'])('prioritizes %s failures over verification', (kind) => {
    const data = assessment();
    if (kind !== 'hazard') data.weather.errors = ['OpenWeather timeout'];
    if (kind !== 'weather') data.hazards.error = 'MGB query failed';
    const error = rainfallProviderError(data);
    expect(error).toContain(kind === 'hazard' ? 'MGB unavailable' : 'Rainfall unavailable');
    if (kind === 'both') expect(error).toContain('MGB unavailable');
    expect(status(data)).toBe('');
    expect(unavailable(data)).toBe(true);
  });
  it('does not show loading or success after request failure', () => {
    expect(status(null, 'Request timed out')).toBe('');
  });
  it('keeps stale refresh notices and playback protection', () => {
    const data = assessment(true);
    data.assessedAt = new Date(now - 16 * 60000).toISOString();
    expect(staleRainfall(false, data, now)).toBe(true);
    expect(status(data, '', true)).toBe('');
    expect(unavailable(data, true)).toBe(true);
    expect(mainErrorMessage({ error: '', routeError: '', rainfallError: '', staleRainfall: true, staleTraffic: false })).toContain('stale');
  });
  it('shows successful assessment only for complete results', () => {
    const data = assessment(true);
    data.routes[0].score = 1;
    expect(status(data)).toContain('Rainfall assessed');
  });
});
