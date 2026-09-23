import { remainingPath } from '$lib/services/demoSimulation';
import { cumulativeDistances, type RoadRoute } from '$lib/services/routingService';

export function remainingRoad(road: RoadRoute, moved: number): RoadRoute {
	const length = cumulativeDistances(road.polyline).at(-1) || 1;
	return {
		...road,
		polyline: remainingPath(road.polyline, moved),
		distanceMeters: Math.max(0, length - moved),
		durationSeconds: road.durationSeconds * Math.max(0, 1 - moved / length),
		steps: road.steps
			.filter((step) => step.progressMeters >= moved)
			.map((step) => ({ ...step, progressMeters: step.progressMeters - moved }))
	};
}

export function samePolyline(a: RoadRoute['polyline'], b: RoadRoute['polyline']) {
	return JSON.stringify(a) === JSON.stringify(b);
}
