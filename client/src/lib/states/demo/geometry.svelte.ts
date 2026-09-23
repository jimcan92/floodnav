import { remainingPath } from '$lib/services/demoSimulation';
import { positionAt } from '$lib/services/routingService';
import { remainingRoad } from '$lib/utils/route';
import { demo, navigation } from './core.svelte';

export function rebaseAtCurrentPosition() {
	const road = navigation.ownRoad;
	const moved = demo.progress;
	demo.routingStart =
		navigation.gpsTravel && demo.gpsPosition
			? demo.gpsPosition
			: road
				? positionAt(road.polyline, moved)
				: demo.origin.coordinate;
	if (road && moved > 0 && remainingPath(road.polyline, moved).length > 1) {
		demo.roads = [remainingRoad(road, moved)];
		demo.selectedKey = road.key;
	}
	demo.completedMeters += moved;
	demo.progress = 0;
}
