import { randomUUID } from 'node:crypto';
import type { Conditions, DemoRoom, SimulationZone, Telemetry } from '../types/demo';
import { scenarioFloods } from '../data/demoScenarios';

export class DemoError extends Error {
	constructor(
		message: string,
		public status = 400
	) {
		super(message);
	}
}
export function coordinate(value: unknown): asserts value is [number, number] {
	if (
		!Array.isArray(value) ||
		value.length !== 2 ||
		!value.every(Number.isFinite) ||
		Math.abs(value[0]) > 90 ||
		Math.abs(value[1]) > 180
	)
		throw new DemoError('Invalid coordinates.');
}
function numeric(value: unknown, min: number, max: number) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
		throw new DemoError('Value outside supported range.');
}
export function validateConditions(value: Conditions): Conditions {
	if (
		!value ||
		typeof value.trafficSimulation !== 'boolean' ||
		typeof value.floodSimulation !== 'boolean' ||
		!Array.isArray(value.zones) ||
		value.zones.length > 100
	)
		throw new DemoError('Invalid conditions. Maximum 100 zones.');
	const ids = new Set<string>();
	for (const z of value.zones) {
		if (
			!z ||
			typeof z.id !== 'string' ||
			!z.id ||
			z.id.length > 100 ||
			ids.has(z.id) ||
			typeof z.name !== 'string' ||
			!z.name.trim() ||
			z.name.length > 100 ||
			!['traffic', 'flood'].includes(z.kind) ||
			!['light', 'moderate', 'heavy'].includes(z.level) ||
			typeof z.enabled !== 'boolean'
		)
			throw new DemoError('Invalid zone.');
		ids.add(z.id);
		coordinate(z.center);
		numeric(z.radiusMeters, 10, 1000);
		numeric(z.depthCm, 0, 200);
		numeric(z.rainMmH, 0, 300);
	}
	return structuredClone(value);
}
function validateTelemetry(t: Telemetry) {
	if (t?.dataStatus && [t.dataStatus.traffic, t.dataStatus.rainfall].some(v => typeof v !== 'string' || v.length > 500)) throw new DemoError('Invalid data status.');
	if (
		!t ||
		!['idle', 'running', 'paused', 'blocked', 'arrived'].includes(t.status) ||
		typeof t.vehicleId !== 'string' ||
		t.vehicleId.length > 60
	)
		throw new DemoError('Invalid traveler state.');
	for (const w of [t.origin, t.destination]) {
		if (!w || typeof w.name !== 'string' || w.name.length > 300)
			throw new DemoError('Invalid waypoint.');
		coordinate(w.coordinate);
	}
	coordinate(t.position);
	numeric(t.progress, 0, 50_000_000);
	numeric(t.completedMeters, 0, 50_000_000);
	numeric(t.remainingSeconds, 0, 50_000_000);
	if (t.route) {
		const r = t.route;
		if (
			!['osrm', 'fixture', 'tomtom'].includes(r.source) ||
			typeof r.key !== 'string' ||
			!Array.isArray(r.polyline) ||
			r.polyline.length < 2 ||
			r.polyline.length > 50000 ||
			!Array.isArray(r.steps) ||
			r.steps.length > 5000
		)
			throw new DemoError('Invalid route.');
		r.polyline.forEach(coordinate);
		numeric(r.distanceMeters, 0, 50_000_000);
		numeric(r.durationSeconds, 0, 50_000_000);
		for (const s of r.steps) {
			if (typeof s.instruction !== 'string' || s.instruction.length > 1000)
				throw new DemoError('Invalid maneuver.');
			coordinate(s.coordinate);
			numeric(s.progressMeters, 0, 50_000_000);
		}
	}
}
export class RoomStore {
	private rooms = new Map<string, DemoRoom>();
	private listeners = new Map<string, Set<(room: DemoRoom) => void>>();
	create() {
		if (this.rooms.size >= 200)
			throw new DemoError('Demo server is full. Restart it to clear rooms.', 503);
		const room: DemoRoom = {
			id: randomUUID(),
			revision: 0,
			sequence: 0,
			resetVersion: 0,
			preset: null,
			conditions: { trafficSimulation: true, floodSimulation: true, zones: [] },
			travelerId: null,
			telemetry: null,
			updatedAt: new Date().toISOString()
		};
		this.rooms.set(room.id, room);
		return structuredClone(room);
	}
	get(id: string) {
		const room = this.rooms.get(id);
		if (!room)
			throw new DemoError(
				'Demo room not found. The server may have restarted. Create a new demo.',
				404
			);
		return structuredClone(room);
	}
	private commit(room: DemoRoom) {
		room.sequence++;
		room.updatedAt = new Date().toISOString();
		this.rooms.set(room.id, room);
		for (const fn of this.listeners.get(room.id) || []) fn(structuredClone(room));
		return structuredClone(room);
	}
	update(id: string, revision: number, conditions: Conditions, preset?: string) {
		const room = this.get(id);
		if (revision !== room.revision)
			throw new DemoError(
				'Conditions changed in another controller. Latest settings loaded; review before applying again.',
				409
			);
		room.conditions = validateConditions(conditions);
		if (preset !== undefined) {
			if (!['dry', 'bypass', 'blocked'].includes(preset)) throw new DemoError('Invalid preset.');
			room.preset = preset as DemoRoom['preset'];
			room.resetVersion++;
			room.conditions = {
				trafficSimulation: true,
				floodSimulation: true,
				zones: scenarioFloods(room.preset!).map(
					(z) =>
						({
							id: z.id,
							kind: 'flood',
							name: z.name,
							center: z.center,
							radiusMeters: z.radiusMeters,
							depthCm: z.depthCm,
							rainMmH: 10,
							level: 'moderate',
							enabled: true
						}) satisfies SimulationZone
				)
			};
			room.telemetry = null;
		}
		room.revision++;
		return this.commit(room);
	}
	claim(id: string, travelerId: string, takeover = false) {
		if (typeof travelerId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(travelerId))
			throw new DemoError('Invalid traveler ID.');
		const room = this.get(id);
		if (room.travelerId && room.travelerId !== travelerId && !takeover)
			throw new DemoError('Another traveler is active. Take control to continue.', 409);
		room.travelerId = travelerId;
		return this.commit(room);
	}
	telemetry(id: string, travelerId: string, resetVersion: number, telemetry: Telemetry) {
		const room = this.get(id);
		if (!room.travelerId || room.travelerId !== travelerId)
			throw new DemoError('This traveler is read-only.', 409);
		if (resetVersion !== room.resetVersion)
			throw new DemoError('Scenario was reset. Refresh room state.', 409);
		validateTelemetry(telemetry);
		room.telemetry = structuredClone(telemetry);
		return this.commit(room);
	}
	subscribe(id: string, fn: (room: DemoRoom) => void) {
		const initial = this.get(id);
		let list = this.listeners.get(id);
		if (!list) this.listeners.set(id, (list = new Set()));
		list.add(fn);
		fn(initial);
		return () => {
			list!.delete(fn);
			if (!list!.size) this.listeners.delete(id);
		};
	}
}
// Shared across endpoint modules and Vite reloads. Single Node process by design.
const shared = globalThis as typeof globalThis & { floodnavRooms?: RoomStore };
export const rooms = (shared.floodnavRooms ??= new RoomStore());
