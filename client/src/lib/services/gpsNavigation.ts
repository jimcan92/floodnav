import type { Coordinate } from '../types/navigation';
import { cumulativeDistances } from './routingService';

// Project each segment into local meters around the fix; choose the nearest road point.
export function matchGpsToRoute(path: Coordinate[], point: Coordinate, previous = 0) {
	const distances = cumulativeDistances(path);
	const scale = 111320 * Math.cos((point[0] * Math.PI) / 180);
	let best = { progress: 0, distance: Infinity };
	for (let i = 1; i < path.length; i++) {
		const x = (path[i - 1][1] - point[1]) * scale;
		const y = (path[i - 1][0] - point[0]) * 111320;
		const dx = (path[i][1] - path[i - 1][1]) * scale;
		const dy = (path[i][0] - path[i - 1][0]) * 111320;
		const length2 = dx * dx + dy * dy;
		const t = length2 ? Math.max(0, Math.min(1, -(x * dx + y * dy) / length2)) : 0;
		const distance = Math.hypot(x + t * dx, y + t * dy);
		const progress = distances[i - 1] + t * (distances[i] - distances[i - 1]);
		if (
			distance < best.distance - 1 ||
			(Math.abs(distance - best.distance) <= 1 &&
				Math.abs(progress - previous) < Math.abs(best.progress - previous))
		)
			best = { progress, distance };
	}
	return best;
}

export function usableGpsFix(fix: GeolocationPosition, now = Date.now()) {
	const { latitude, longitude, accuracy } = fix.coords;
	return (
		Number.isFinite(latitude) &&
		Math.abs(latitude) <= 90 &&
		Number.isFinite(longitude) &&
		Math.abs(longitude) <= 180 &&
		Number.isFinite(accuracy) &&
		accuracy >= 0 &&
		accuracy <= 100 &&
		Number.isFinite(fix.timestamp) &&
		now - fix.timestamp <= 15000 &&
		fix.timestamp <= now + 1000
	);
}
