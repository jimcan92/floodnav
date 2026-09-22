import type { Conditions } from '../types/demo';
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
	return JSON.parse(JSON.stringify(value));
}
