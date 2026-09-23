import type { IconName } from '$lib/utils/icons';
import type { Coordinate, FloodHazardZone, VehicleCategoryId } from '../types/navigation';
import type { Conditions, SimulationZone } from '../types/demo';
import type { RoadRoute } from './routingService';
import { cumulativeDistances, positionAt, intersectsFlood } from './routingService';

// Illustrative profiles applied to driving estimates, not measured vehicle speeds.
export const VEHICLE_TRAVEL_PROFILES: Record<
	VehicleCategoryId,
	{ label: string; icon: IconName; factor: number }
> = {
	low_clearance: { label: 'Car', icon: 'car', factor: 1 },
	medium_clearance: { label: 'SUV', icon: 'suv', factor: 1.08 },
	high_clearance: { label: 'Truck', icon: 'truck', factor: 1.2 },
	motorcycle: { label: 'Motorcycle', icon: 'motorcycle', factor: 0.9 },
	bicycle: { label: 'Bicycle', icon: 'bicycle', factor: 1 }
};

export function floodZones(zones: SimulationZone[]): FloodHazardZone[] {
	return zones
		.filter((z) => z.kind === 'flood')
		.map((z) => ({
			id: z.id,
			name: z.name,
			center: z.center,
			radiusMeters: z.radiusMeters,
			depthCm: z.depthCm,
			active: z.enabled,
			severity: z.depthCm > 50 ? 'impassable' : z.depthCm > 25 ? 'knee' : 'ankle',
			affectedRoad: 'Custom demo area',
			reportedTime: 'Shared simulation',
			description: `${z.rainMmH} mm/h simulated rainfall`
		}));
}
export function remainingPath(path: Coordinate[], progress: number): Coordinate[] {
	const distances = cumulativeDistances(path);
	return [positionAt(path, progress), ...path.filter((_, i) => distances[i] > progress)];
}
export interface TimedSegment {
	from: number;
	to: number;
	seconds: number;
}
// Split at exact circle boundaries, so a narrow zone on a long road segment is not missed.
export function timedSegments(
	road: RoadRoute,
	zones: SimulationZone[],
	maxDepthCm = 15
): TimedSegment[] {
	const distances = cumulativeDistances(road.polyline),
		length = distances.at(-1) || 1;
	const active = zones.filter((z) => z.enabled && (z.kind === 'traffic' || z.depthCm > 0));
	const result: TimedSegment[] = [];
	for (let i = 1; i < road.polyline.length; i++) {
		const a = road.polyline[i - 1],
			b = road.polyline[i],
			cuts = [0, 1];
		const circles = active.map((z) => {
			const scale = 111320 * Math.cos((z.center[0] * Math.PI) / 180);
			const x = (a[1] - z.center[1]) * scale,
				y = (a[0] - z.center[0]) * 111320;
			const dx = (b[1] - a[1]) * scale,
				dy = (b[0] - a[0]) * 111320;
			const A = dx * dx + dy * dy,
				B = 2 * (x * dx + y * dy),
				C = x * x + y * y - z.radiusMeters ** 2;
			const discriminant = B * B - 4 * A * C;
			if (A > 0 && discriminant >= 0)
				for (const t of [
					(-B - Math.sqrt(discriminant)) / (2 * A),
					(-B + Math.sqrt(discriminant)) / (2 * A)
				])
					if (t > 0 && t < 1) cuts.push(t);
			return { z, x, y, dx, dy };
		});
		cuts.sort((x, y) => x - y);
		for (let j = 1; j < cuts.length; j++) {
			const t = (cuts[j - 1] + cuts[j]) / 2;
			const encountered = circles.filter(
				(c) => Math.hypot(c.x + t * c.dx, c.y + t * c.dy) <= c.z.radiusMeters
			);
			const traffic = Math.max(
				1,
				...encountered
					.filter((c) => c.z.kind === 'traffic')
					.map((c) => (c.z.level === 'heavy' ? 2.5 : c.z.level === 'moderate' ? 1.5 : 1.2))
			);
			// Synthetic slowdown model, not a measured vehicle wading/speed model.
			const flood = Math.max(
				1,
				...encountered
					.filter((c) => c.z.kind === 'flood')
					.map((c) => 1 + Math.min(1, c.z.depthCm / Math.max(1, maxDepthCm)))
			);
			const multiplier = traffic * flood;
			const from = distances[i - 1] + (distances[i] - distances[i - 1]) * cuts[j - 1];
			const to = distances[i - 1] + (distances[i] - distances[i - 1]) * cuts[j];
			if (to > from)
				result.push({
					from,
					to,
					seconds: ((to - from) / length) * Math.max(1, road.durationSeconds) * multiplier
				});
		}
	}
	return result;
}
export function secondsRemaining(segments: TimedSegment[], progress: number) {
	return segments.reduce(
		(sum, s) =>
			sum +
			(progress >= s.to ? 0 : (s.seconds * (s.to - Math.max(s.from, progress))) / (s.to - s.from)),
		0
	);
}
export function advanceTimed(segments: TimedSegment[], progress: number, seconds: number) {
	let next = progress;
	for (const s of segments) {
		if (next >= s.to) continue;
		const start = Math.max(next, s.from),
			available = (s.seconds * (s.to - start)) / (s.to - s.from);
		if (seconds < available) return start + (seconds / s.seconds) * (s.to - s.from);
		seconds -= available;
		next = s.to;
	}
	return next;
}

export function evaluateSimulation(
	road: RoadRoute,
	conditions: Conditions,
	maxDepthCm: number,
	progress = 0,
	vehicleId: VehicleCategoryId = 'low_clearance'
) {
	const zones = conditions.zones.filter((z) =>
		z.kind === 'traffic' ? conditions.trafficSimulation : conditions.floodSimulation
	);
	const travelRoad = {
		...road,
		durationSeconds:
			vehicleId === 'bicycle'
				? Math.max(road.durationSeconds, road.distanceMeters / (15 / 3.6))
				: road.durationSeconds * VEHICLE_TRAVEL_PROFILES[vehicleId].factor
	};
	const segments = timedSegments(travelRoad, zones, maxDepthCm);
	const remaining = secondsRemaining(segments, progress);
	const base = secondsRemaining(timedSegments(travelRoad, []), progress);
	const hasDistanceRemaining = progress < (cumulativeDistances(road.polyline).at(-1) || 0);
	const path = remainingPath(road.polyline, progress);
	const blocked =
		hasDistanceRemaining &&
		floodZones(zones).some((z) => z.depthCm > maxDepthCm && intersectsFlood(path, z));
	return {
		segments,
		blocked,
		seconds: remaining,
		etaSeconds: blocked ? null : remaining,
		delaySeconds: Math.max(0, remaining - base)
	};
}

export function rankSimulationRoutes(
	roads: RoadRoute[],
	conditions: Conditions,
	maxDepthCm: number,
	vehicleId: VehicleCategoryId = 'low_clearance'
) {
	return roads
		.map((road) => ({ road, ...evaluateSimulation(road, conditions, maxDepthCm, 0, vehicleId) }))
		.sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.seconds - b.seconds);
}

export function formatTravelTime(seconds: number) {
	const total = Math.max(0, Math.ceil(seconds - 1e-7));
	return `${Math.floor(total / 60)} min ${total % 60} s`;
}
