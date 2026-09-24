import { DEMO_ROADS } from '$lib/data/demoScenarios';
import { floodZones, rankSimulationRoutes, remainingPath } from '$lib/services/demoSimulation';
import { fetchFloodDetours, positionAt, type RoadRoute } from '$lib/services/routingService';
import { haversineDistanceKm } from '$lib/services/trafficService';
import { setMobilePanel } from '$lib/states/layout.svelte';
import type { Conditions } from '$lib/types/demo';
import type { Coordinate } from '$lib/types/navigation';
import { loadRoadRoutes } from '$lib/utils/http';
import { samePolyline } from '$lib/utils/route';
import { demo, navigation } from './core.svelte';
import { runtime } from './runtime';
import { updateGpsProgress } from './gps.svelte';

export async function findAlternative(fasterOnly = false) {
	runtime.rerouteAbort?.abort();
	if (!navigation.ownRoad || !navigation.editable) return;
	if (demo.offlineDemo && (demo.progress > 0 || demo.roads.length < 2)) {
		demo.notice =
			'New routes need internet. Restart the example trip to compare bundled alternatives.';
		return;
	}
	demo.rerouting = true;
	demo.notice = '';
	if (demo.progress > 0 && demo.playing && !navigation.gpsTravel) {
		demo.playing = false;
		demo.notice = 'Conditions changed. Travel paused while checking alternatives.';
	}
	const version = ++runtime.rerouteGeneration;
	const current = positionAt(navigation.ownRoad.polyline, demo.progress);
	const currentRoad = navigation.ownRoad;
	const currentPath = remainingPath(currentRoad.polyline, demo.progress);
	const atStart = demo.progress === 0;
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), 18000);
	runtime.rerouteAbort = abort;
	try {
		const result =
			atStart && demo.roads.length > 1
				? demo.roads
				: await loadRoadRoutes(
						current,
						demo.destination.coordinate,
						navigation.conditions.trafficSimulation,
						abort.signal,
						demo.offlineDemo
					);
		if (version !== runtime.rerouteGeneration || runtime.disposed) return;
		demo.candidates = rankSimulationRoutes(
			result,
			navigation.conditions,
			navigation.vehicle.maxSafeWaterDepthCm,
			navigation.vehicle.id
		)
			.filter(
				(item) =>
					!item.blocked &&
					!samePolyline(item.road.polyline, currentPath) &&
					(!atStart || item.road.key !== currentRoad.key) &&
					(!fasterOnly || navigation.blocked || item.seconds < navigation.remainingSeconds)
			)
			.map((item) => item.road);
		if (
			!demo.candidates.length &&
			navigation.blocked &&
			navigation.conditions.floodSimulation &&
			!demo.offlineDemo
		) {
			demo.notice = 'Searching nearby roads around the simulated flooding…';
			const hazards = floodZones(navigation.conditions.zones).filter(
				(zone) => zone.depthCm > navigation.vehicle.maxSafeWaterDepthCm
			);
			const detours = await fetchFloodDetours(
				current,
				demo.destination.coordinate,
				currentPath,
				hazards,
				abort.signal
			);
			if (version !== runtime.rerouteGeneration || runtime.disposed) return;
			demo.candidates = rankSimulationRoutes(
				detours,
				navigation.conditions,
				navigation.vehicle.maxSafeWaterDepthCm,
				navigation.vehicle.id
			)
				.filter((route) => !route.blocked)
				.map((route) => route.road);
			demo.notice = demo.candidates.length
				? 'Found a road detour avoiding the blocking simulated flood zones. ETA uses basic road estimates.'
				: 'No passable detour found in the nearby roads checked. Try another start or destination, or review the simulated flood areas.';
		} else if (!demo.candidates.length)
			demo.notice = navigation.blocked
				? 'No passable alternative available among returned roads. Travel stays paused.'
				: fasterOnly
					? 'No faster alternative available among returned roads.'
					: 'No different passable route returned by the routing service.';
	} catch (error) {
		if (version === runtime.rerouteGeneration)
			demo.notice = error instanceof Error ? error.message : 'Could not find an alternative.';
	} finally {
		clearTimeout(timer);
		if (runtime.rerouteAbort === abort) runtime.rerouteAbort = null;
		if (version === runtime.rerouteGeneration) demo.rerouting = false;
	}
}

export async function findObservedAlternative() {
	if (!navigation.ownRoad || !navigation.canAvoidObserved || demo.rerouting) return;
	runtime.rerouteAbort?.abort();
	const abort = new AbortController();
	runtime.rerouteAbort = abort;
	const version = ++runtime.rerouteGeneration;
	const from: Coordinate = [...navigation.position];
	const polygons = navigation.observedAvoidance.flatMap((feature) =>
		feature.geometry.coordinates.map((polygon) => ({
			type: 'MultiPolygon' as const,
			coordinates: [polygon]
		}))
	);
	const hazards = navigation.floodSimulation
		? floodZones(navigation.conditions.zones).filter(
				(zone) => zone.depthCm > navigation.vehicle.maxSafeWaterDepthCm
			)
		: [];
	demo.rerouting = true;
	demo.candidates = [];
	try {
		const routes = await fetchFloodDetours(
			from,
			demo.destination.coordinate,
			navigation.observedPath,
			hazards,
			abort.signal,
			polygons
		);
		if (version !== runtime.rerouteGeneration || runtime.disposed) return;
		if (haversineDistanceKm(from, navigation.position) * 1000 > 30) {
			demo.notice = 'Your position changed. Search again from your current location.';
			return;
		}
		demo.candidates = routes;
		demo.notice = routes.length
			? 'Alternative avoids the recent satellite flood polygons. Other road conditions remain unconfirmed.'
			: 'No alternative found in the nearby roads checked. This does not prove that no detour exists.';
	} catch (error) {
		if (version === runtime.rerouteGeneration)
			demo.notice = error instanceof Error ? error.message : 'Alternative search unavailable.';
	} finally {
		if (version === runtime.rerouteGeneration) demo.rerouting = false;
		if (runtime.rerouteAbort === abort) runtime.rerouteAbort = null;
	}
}

export async function selectDisplayedAlternative(road: RoadRoute) {
	if (!navigation.editable || demo.rerouting) return;
	if (demo.started && haversineDistanceKm(navigation.position, road.polyline[0]) * 1000 > 30) {
		await findAlternative(false);
		demo.notice = demo.candidates.length
			? 'Original routes remain visible for comparison. Choose an updated alternative starting from your current location.'
			: 'Original routes remain visible, but no updated alternative from your current location was found.';
		return;
	}
	acceptAlternative(road);
}

export function acceptAlternative(road: RoadRoute) {
	runtime.rerouteAbort?.abort();
	void setMobilePanel(null, true);
	runtime.rerouteGeneration++;
	demo.rerouting = false;
	demo.playing = false;
	demo.completedMeters += demo.progress;
	demo.progress = 0;
	demo.roads = [road];
	demo.selectedKey = road.key;
	demo.candidates = [];
	demo.notice = 'Alternative selected. Resume when ready.';
	demo.lastSpeech = '';
}

export function bumpRerouteSearch() {
	runtime.rerouteAbort?.abort();
	demo.candidates = [];
	runtime.rerouteGeneration++;
	demo.rerouting = false;
	if (
		!navigation.gpsTravel &&
		navigation.ownRoad &&
		!navigation.arrived &&
		(navigation.blocked || (navigation.evaluation?.delaySeconds || 0) > 0)
	)
		void findAlternative(true);
}

export function bindRouteFetch() {
	if (!demo.mounted || !navigation.sharedReady) return;
	const start = demo.routingStart || demo.origin.coordinate;
	const end = demo.destination.coordinate;
	const simulated = navigation.trafficSimulation;
	const useFixture = demo.fixture;
	void demo.routeRequest;
	const generation = ++runtime.routeGeneration;
	const abort = new AbortController();
	let cancelled = false;
	if (useFixture) {
		demo.roads = DEMO_ROADS;
		demo.originalRoads = DEMO_ROADS;
		demo.selectedKey = DEMO_ROADS[0].key;
		demo.routeError = '';
		demo.busy = false;
		return;
	}
	demo.busy = true;
	demo.routeError = '';
	const timer = setTimeout(() => abort.abort(), 18000);
	void loadRoadRoutes(start, end, simulated, abort.signal, demo.offlineDemo)
		.then((result) => {
			if (!cancelled && generation === runtime.routeGeneration) {
				demo.roads = result;
				if (!demo.started || !demo.originalRoads.length) demo.originalRoads = result;
				demo.selectedKey = result[0]?.key || '';
				demo.candidates = [];
			}
		})
		.catch((error) => {
			if (!cancelled)
				demo.routeError = abort.signal.aborted
					? 'Routing timed out. Retry or load a demo preset from simulation controls.'
					: error.message;
		})
		.finally(() => {
			clearTimeout(timer);
			if (!cancelled) {
				demo.busy = false;
				if (!demo.routeError && demo.started && navigation.gpsTravel && demo.gpsPosition)
					updateGpsProgress();
			}
		});
	return () => {
		cancelled = true;
		abort.abort();
		clearTimeout(timer);
	};
}
