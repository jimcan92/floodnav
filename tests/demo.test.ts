import { describe, it, expect } from 'vitest';
import { RoomStore, validateConditions } from '../client/src/lib/server/demoRooms';
import { timedSegments, secondsRemaining, advanceTimed, remainingPath, floodZones } from '../client/src/lib/services/demoSimulation';
import { cumulativeDistances, intersectsFlood, type RoadRoute } from '../client/src/lib/services/routingService';
import { parseTomTomRoutes } from '../client/src/lib/services/tomtomRoutes';
import type { Conditions, SimulationZone, Telemetry } from '../client/src/lib/types/demo';
const road: RoadRoute = { key: 'test', source: 'osrm', polyline: [[0, 0], [0, .01]], durationSeconds: 100, distanceMeters: 1112, steps: [] };
const zone: SimulationZone = { id: 'a', kind: 'traffic', center: [0, .005], name: 'Test', enabled: true, radiusMeters: 111.32, level: 'heavy', depthCm: 80, rainMmH: 10 };
const conditions: Conditions = { trafficSimulation: true, floodSimulation: true, zones: [zone] };
const telemetry: Telemetry = { origin: { name: 'A', coordinate: [0, 0] }, destination: { name: 'B', coordinate: [0, .01] }, position: [0, 0], route: road, progress: 0, completedMeters: 0, remainingSeconds: 100, status: 'running', vehicleId: 'low_clearance' };
describe('shared demo rooms', () => {
 it('publishes snapshots, isolates rooms, rejects stale edits and invalid values', () => {
  const store = new RoomStore(), a = store.create(), b = store.create(); const seen: number[] = [];
  const stop = store.subscribe(a.id, room => seen.push(room.revision));
  store.update(a.id, 0, conditions); expect(seen).toEqual([0, 1]); expect(store.get(b.id).conditions.zones).toHaveLength(0);
  expect(() => store.update(a.id, 0, conditions)).toThrow(/changed/);
  expect(() => validateConditions({ ...conditions, zones: [{ ...zone, depthCm: NaN }] })).toThrow();
  expect(() => validateConditions({ ...conditions, zones: [{ ...zone, radiusMeters: 1001 }] })).toThrow();
  expect(() => validateConditions({ ...conditions, zones: [zone, zone] })).toThrow(); stop();
 });
 it('requires explicit takeover and rejects old traveler telemetry and preset epochs', () => {
  const store = new RoomStore(), room = store.create(); store.claim(room.id, 'traveler-one');
  expect(() => store.claim(room.id, 'traveler-two')).toThrow(/active/);
  store.telemetry(room.id, 'traveler-one', 0, telemetry); store.claim(room.id, 'traveler-two', true);
  expect(store.get(room.id).telemetry?.status).toBe('running');
  expect(() => store.telemetry(room.id, 'traveler-one', 0, telemetry)).toThrow(/read-only/);
  store.update(room.id, 0, conditions, 'bypass');
  expect(store.get(room.id).telemetry).toBeNull();
  expect(() => store.telemetry(room.id, 'traveler-two', 0, telemetry)).toThrow(/reset/);
 });
 it('source switches preserve custom zones', () => {
  const store = new RoomStore(), room = store.create();
  const updated = store.update(room.id, 0, { ...conditions, trafficSimulation: false });
  expect(updated.conditions.zones).toEqual([zone]); expect(updated.conditions.floodSimulation).toBe(true);
 });
});
describe('segment simulation', () => {
 it('charges only intersecting portions and does not stack overlapping traffic', () => {
  const segments = timedSegments(road, [zone]);
  expect(secondsRemaining(segments, 0)).toBeCloseTo(130, 4);
  expect(secondsRemaining(timedSegments(road, [zone, { ...zone, id: 'b' }]), 0)).toBeCloseTo(130, 4);
  expect(secondsRemaining(timedSegments(road, [{ ...zone, enabled: false }]), 0)).toBeCloseTo(100);
 });
 it('ETA and playback consume the same time through boundaries', () => {
  const segments = timedSegments(road, [zone]); const next = advanceTimed(segments, 0, 60);
  expect(secondsRemaining(segments, next)).toBeCloseTo(70);
  expect(advanceTimed(segments, next, 70)).toBeCloseTo(cumulativeDistances(road.polyline).at(-1)!);
 });
 it('floods behind traveler do not block remaining route', () => {
  const flood = floodZones([{ ...zone, kind: 'flood', center: [0, .001], radiusMeters: 50 }])[0];
  expect(intersectsFlood(road.polyline, flood)).toBe(true);
  expect(intersectsFlood(remainingPath(road.polyline, 500), flood)).toBe(false);
 });
});
describe('TomTom normalization', () => {
 it('keeps geometry and live timing from the same route', () => {
  const routes = parseTomTomRoutes({ routes: [{ summary: { lengthInMeters: 1112, travelTimeInSeconds: 150, noTrafficTravelTimeInSeconds: 100, trafficDelayInSeconds: 50 }, legs: [{ points: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: .01 }] }] }] });
  expect(routes[0].source).toBe('tomtom'); expect(routes[0].durationSeconds).toBe(150); expect(routes[0].baseDurationSeconds).toBe(100); expect(routes[0].steps.at(-1)?.maneuver).toBe('arrive');
  expect(() => parseTomTomRoutes({ routes: [] })).toThrow();
 });
});
