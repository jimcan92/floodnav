import type { Coordinate, FloodHazardZone } from '../types/navigation';
import type { SimulationZone } from '../types/demo';
import type { RoadRoute } from './routingService';
import { cumulativeDistances, positionAt } from './routingService';

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
			reportedTime: 'Controller scenario',
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
export function timedSegments(road: RoadRoute, zones: SimulationZone[]): TimedSegment[] {
	const distances = cumulativeDistances(road.polyline),
		length = distances.at(-1) || 1;
	const active = zones.filter((z) => z.kind === 'traffic' && z.enabled);
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
			const multiplier = Math.max(
				1,
				...circles
					.filter((c) => Math.hypot(c.x + t * c.dx, c.y + t * c.dy) <= c.z.radiusMeters)
					.map((c) => (c.z.level === 'heavy' ? 2.5 : c.z.level === 'moderate' ? 1.5 : 1))
			);
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
