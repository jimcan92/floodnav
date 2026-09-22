import { describe, it, expect } from 'vitest';
import { matchGpsToRoute, usableGpsFix } from '../client/src/lib/services/gpsNavigation';
import { cumulativeDistances } from '../client/src/lib/services/routingService';
import type { Coordinate } from '../client/src/lib/types/navigation';
const path: Coordinate[] = [[10, 123], [10, 123.01], [10.01, 123.01]];
describe('GPS route matching', () => {
 it('matches intermediate fixes to route distance, clamps endpoints, and measures deviations', () => {
  const distances = cumulativeDistances(path);
  expect(matchGpsToRoute(path, [10, 123.005]).progress).toBeCloseTo(distances[1] / 2);
  expect(matchGpsToRoute(path, [10, 122.99]).progress).toBe(0);
  expect(matchGpsToRoute(path, [10.02, 123.01]).progress).toBeCloseTo(distances[2]);
  expect(matchGpsToRoute(path, [10.005, 123.005]).distance).toBeGreaterThan(500);
 });
 it('does not jump to a later leg at an overlapping route point', () => {
  const loop: Coordinate[] = [[10, 123], [10, 123.01], [10, 123]];
  const distance = cumulativeDistances(loop)[1];
  expect(matchGpsToRoute(loop, [10, 123.005], distance / 2).progress).toBeCloseTo(distance / 2);
  expect(matchGpsToRoute(loop, [10, 123.005], distance * 1.5).progress).toBeCloseTo(distance * 1.5);
 });
 it('rejects stale, invalid and inaccurate fixes', () => {
  const now = Date.now();
  const fix = { timestamp: now, coords: { latitude: 10, longitude: 123, accuracy: 10 } } as GeolocationPosition;
  expect(usableGpsFix(fix, now)).toBe(true);
  expect(usableGpsFix({...fix, timestamp: now - 16000}, now)).toBe(false);
  expect(usableGpsFix({...fix, coords: {...fix.coords, accuracy: 200}}, now)).toBe(false);
  expect(usableGpsFix({...fix, coords: {...fix.coords, latitude: NaN}}, now)).toBe(false);
 });
});
