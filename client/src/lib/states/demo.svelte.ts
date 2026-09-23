import { DEMO_DESTINATION, DEMO_ORIGIN, DEMO_ROADS, scenarioConditions } from '$lib/data/demoScenarios';
import { DEFAULT_VEHICLE_CATEGORY, VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
import { demoId } from '$lib/services/demoId';
import {
	advanceTimed,
	evaluateSimulation,
	floodZones,
	rankSimulationRoutes,
	remainingPath
} from '$lib/services/demoSimulation';
import { matchGpsToRoute, usableGpsFix } from '$lib/services/gpsNavigation';
import {
	actionableObservedFloods,
	intersectsObservedFlood,
	recentObservedFloods
} from '$lib/services/observedFlood';
import { pwaState } from '$lib/services/pwaState.svelte';
import {
	cumulativeDistances,
	fetchFloodDetours,
	positionAt,
	type RoadRoute
} from '$lib/services/routingService';
import { validateConditions } from '$lib/services/simulationValidation';
import { haversineDistanceKm } from '$lib/services/trafficService';
import { floods } from '$lib/states/floods.svelte';
import { beginPick, layout, setConfiguration, setMobilePanel } from '$lib/states/layout.svelte';
import type { Conditions, SimulationState, SimulationZone, Waypoint } from '$lib/types/demo';
import type { Coordinate, DemoScenario, VehicleCategoryId } from '$lib/types/navigation';
import type { ExposureAssessment } from '$lib/types/rainfall';
import { loadRainfallAssessment, loadRoadRoutes, requestJson } from '$lib/utils/http';
import {
	liveUnavailable as liveUnavailableOf,
	mainErrorMessage,
	notificationCount as countFlags,
	observedStale,
	providerStatusMessage,
	staleRainfall as staleRainfallOf,
	staleTraffic as staleTrafficOf,
	travelStatus,
	urgentStatusMessage,
	nextStepOf
} from '$lib/utils/messages';
import { remainingRoad, samePolyline } from '$lib/utils/route';

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10, 20];

export function initialOrigin(): Waypoint {
	return { name: 'Fuente Osmeña Circle', coordinate: [...DEMO_ORIGIN] };
}
export function initialDestination(): Waypoint {
	return { name: 'SM City Cebu', coordinate: [...DEMO_DESTINATION] };
}

export const demo = $state({
	mounted: false,
	shared: null as SimulationState | null,
	connected: false,
	offlineDemo: false,
	localSimulation: null as SimulationState | null,
	origin: initialOrigin(),
	destination: initialDestination(),
	vehicleId: DEFAULT_VEHICLE_CATEGORY.id as VehicleCategoryId,
	roads: [] as RoadRoute[],
	selectedKey: '',
	progress: 0,
	completedMeters: 0,
	playbackSpeed: 1,
	requestedMode: '' as 'gps' | 'demo' | '',
	gpsPosition: null as Coordinate | null,
	gpsAccuracy: 0,
	gpsMessage: '',
	gpsArrived: false,
	gpsTimestamp: 0,
	offRoute: false,
	playing: false,
	started: false,
	busy: false,
	muted: false,
	notice: '',
	error: '',
	routeError: '',
	trafficStatus: '',
	rainfallError: '',
	assessment: null as ExposureAssessment | null,
	routingStart: null as Coordinate | null,
	routeRequest: 0,
	weatherRequest: 0,
	fixture: false,
	picked: null as { kind: 'traffic' | 'flood'; center: Coordinate; token: number } | null,
	selectedZone: null as string | null,
	candidates: [] as RoadRoute[],
	previewZones: null as SimulationZone[] | null,
	rerouting: false,
	clock: Date.now(),
	syncError: '',
	lastSpeech: ''
});

let gpsInitialized = false;
let lastGpsReroute = 0;
let rerouteAbort: AbortController | null = null;
let routeGeneration = 0;
let rerouteGeneration = 0;
let lastSnapshot = 0;
let syncing = false;
let disposed = false;

export const currentSimulation = $derived(demo.offlineDemo ? demo.localSimulation : demo.shared);
export const conditions = $derived(
	currentSimulation?.conditions || { trafficSimulation: false, floodSimulation: false, zones: [] }
);
export const trafficSimulation = $derived(conditions.trafficSimulation);
export const floodSimulation = $derived(conditions.floodSimulation);
export const travelMode = $derived(
	demo.requestedMode || (trafficSimulation || floodSimulation ? 'demo' : 'gps')
);
export const gpsTravel = $derived(travelMode === 'gps');
export const editable = $derived(demo.mounted && (demo.offlineDemo || demo.connected));
export const sharedReady = $derived(!!currentSimulation);
export const vehicle = $derived(
	VEHICLE_CATEGORIES.find((item) => item.id === demo.vehicleId) || DEFAULT_VEHICLE_CATEGORY
);
export const ownRoad = $derived(demo.roads.find((road) => road.key === demo.selectedKey) || demo.roads[0] || null);
export const observedPath = $derived(ownRoad ? remainingPath(ownRoad.polyline, demo.progress) : []);
export const observedEncounters = $derived(
	recentObservedFloods(pwaState.online && !demo.offlineDemo ? floods.data : null, demo.clock).filter(
		(feature) => intersectsObservedFlood(observedPath, feature.geometry)
	)
);
export const observedAvoidance = $derived(actionableObservedFloods(floods.data, demo.clock));
export const canAvoidObserved = $derived(
	!demo.offlineDemo &&
		pwaState.online &&
		observedAvoidance.some((feature) => intersectsObservedFlood(observedPath, feature.geometry))
);
export const position = $derived(
	demo.started && gpsTravel && demo.gpsPosition
		? demo.gpsPosition
		: ownRoad
			? positionAt(ownRoad.polyline, demo.progress)
			: demo.origin.coordinate
);
export const visibleZones = $derived(
	(drawerOpenValue() || layout.picking === 'traffic' || layout.picking === 'flood') && demo.previewZones
		? demo.previewZones
		: conditions.zones.filter((zone) =>
				zone.kind === 'traffic' ? trafficSimulation : floodSimulation
			)
);
export const evaluation = $derived(
	ownRoad
		? evaluateSimulation(ownRoad, conditions, vehicle.maxSafeWaterDepthCm, demo.progress, vehicle.id)
		: null
);
export const ranked = $derived(
	rankSimulationRoutes(demo.roads, conditions, vehicle.maxSafeWaterDepthCm, vehicle.id)
);
export const timing = $derived(evaluation?.segments || []);
export const total = $derived(ownRoad ? cumulativeDistances(ownRoad.polyline).at(-1) || 0 : 0);
export const remainingSeconds = $derived(evaluation?.seconds || 0);
export const blocked = $derived(evaluation?.blocked || false);
export const arrived = $derived(demo.started && gpsTravel ? demo.gpsArrived : total > 0 && demo.progress >= total);
export const staleTraffic = $derived(staleTrafficOf(conditions.trafficSimulation, ownRoad?.fetchedAt, demo.clock));
export const staleRainfall = $derived(staleRainfallOf(floodSimulation, demo.assessment, demo.clock));
export const liveUnavailable = $derived(
	liveUnavailableOf({
		routeError: demo.routeError,
		staleTraffic,
		staleRainfall,
		floodSimulation,
		assessment: demo.assessment,
		rainfallError: demo.rainfallError
	})
);
export const nextStep = $derived(nextStepOf(ownRoad, demo.progress));
export const status = $derived(
	travelStatus({
		arrived,
		gpsTravel,
		started: demo.started,
		playing: demo.playing,
		busy: demo.busy,
		blocked,
		gpsMessage: demo.gpsMessage
	})
);
export const remainingMeters = $derived(Math.max(0, total - demo.progress));
export const alternative = $derived(
	demo.candidates[0] ||
		(demo.progress === 0
			? ranked.find(
					(result) =>
						result.road.key !== ownRoad?.key &&
						!result.blocked &&
						!samePolyline(result.road.polyline, ownRoad?.polyline || [])
				)?.road
			: null) ||
		null
);
export const alternativeEvaluation = $derived(
	alternative
		? evaluateSimulation(alternative, conditions, vehicle.maxSafeWaterDepthCm, 0, vehicle.id)
		: null
);
export const mainError = $derived(
	mainErrorMessage({
		error: demo.error,
		routeError: demo.routeError,
		rainfallError: demo.rainfallError,
		staleRainfall,
		staleTraffic
	})
);
export const providerMessage = $derived(
	providerStatusMessage({
		trafficSimulation,
		floodSimulation,
		trafficStatus: demo.trafficStatus,
		assessment: demo.assessment
	})
);
export const notices = $derived(
	countFlags([
		demo.offlineDemo,
		!demo.connected && demo.shared && !demo.offlineDemo,
		!trafficSimulation && ownRoad?.source === 'osrm',
		demo.started && gpsTravel && demo.gpsMessage,
		demo.syncError && !demo.offlineDemo,
		blocked,
		alternative && alternativeEvaluation,
		mainError,
		demo.notice,
		providerMessage,
		observedEncounters.length > 0,
		observedStale(floods.data)
	])
);
export const urgentMessage = $derived(
	urgentStatusMessage({
		blocked,
		routeError: demo.routeError,
		started: demo.started,
		gpsTravel,
		gpsMessage: demo.gpsMessage,
		liveUnavailable
	})
);

function drawerOpenValue() {
	return layout.mobile ? layout.mobilePanel === 'configuration' : layout.desktopDrawerOpen;
}

export function receive(next: SimulationState) {
	lastSnapshot = Date.now();
	demo.connected = true;
	demo.syncError = '';
	if (demo.shared && next.revision <= demo.shared.revision) return;
	if (demo.offlineDemo) {
		demo.shared = next;
		return;
	}
	const previous = demo.shared?.conditions;
	if (
		previous &&
		(previous.trafficSimulation !== next.conditions.trafficSimulation ||
			previous.floodSimulation !== next.conditions.floodSimulation)
	) {
		if (!gpsTravel) demo.playing = false;
		rebaseAtCurrentPosition();
		demo.fixture = false;
		demo.routeRequest++;
		demo.notice = gpsTravel
			? 'Shared data source changed. GPS tracking continues.'
			: 'Data source changed. Review the remaining route, then resume.';
	}
	demo.shared = next;
	demo.candidates = [];
	demo.rerouting = false;
	rerouteGeneration++;
}

export async function syncConditions() {
	if (syncing || disposed || !navigator.onLine) return;
	syncing = true;
	try {
		const next = await requestJson('/api/simulation', 'GET', undefined, receive);
		if (!disposed) receive(next);
	} catch (error) {
		if (!disposed)
			demo.syncError = error instanceof Error ? error.message : 'Shared conditions unavailable.';
	} finally {
		syncing = false;
	}
}

export function rebaseAtCurrentPosition() {
	const road = ownRoad;
	const moved = demo.progress;
	demo.routingStart =
		gpsTravel && demo.gpsPosition
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

export function tickDemoClock() {
	demo.clock = Date.now();
	if (!lastSnapshot || demo.clock - lastSnapshot > 15000) demo.connected = false;
	if (!demo.connected && !gpsTravel && !demo.offlineDemo) demo.playing = false;
	if (
		!gpsTravel &&
		demo.playing &&
		editable &&
		!demo.busy &&
		!blocked &&
		!liveUnavailable &&
		!document.hidden
	)
		demo.progress = advanceTimed(timing, demo.progress, 0.25 * demo.playbackSpeed);
	if (demo.started && gpsTravel && demo.playing && demo.gpsTimestamp && demo.clock - demo.gpsTimestamp > 15000)
		demo.gpsMessage = 'GPS signal stale — waiting for location';
	if (arrived) demo.playing = false;
}

export function startTrip() {
	void setMobilePanel(null);
	demo.requestedMode = travelMode;
	if (gpsTravel && (!window.isSecureContext || !navigator.geolocation)) {
		demo.notice = 'Live GPS needs HTTPS (or localhost) and a browser with location support.';
		return;
	}
	gpsInitialized = false;
	demo.gpsTimestamp = 0;
	demo.gpsArrived = false;
	demo.gpsPosition = null;
	demo.offRoute = false;
	demo.gpsMessage = gpsTravel ? 'Finding your location…' : '';
	demo.candidates = [];
	rerouteGeneration++;
	demo.rerouting = false;
	demo.started = true;
	demo.playing = true;
}

export function routeFromGps(point: Coordinate) {
	demo.completedMeters += demo.progress;
	demo.progress = 0;
	demo.routingStart = point;
	demo.fixture = false;
	demo.candidates = [];
	rerouteGeneration++;
	demo.routeRequest++;
	lastGpsReroute = Date.now();
}

export function receiveGps(fix: GeolocationPosition) {
	if (!usableGpsFix(fix)) {
		demo.gpsMessage = 'GPS accuracy is low — waiting for a reliable location';
		return;
	}
	if (fix.timestamp < demo.gpsTimestamp) return;
	demo.gpsPosition = [fix.coords.latitude, fix.coords.longitude];
	demo.gpsAccuracy = fix.coords.accuracy;
	demo.gpsTimestamp = fix.timestamp;
	demo.gpsMessage = '';
	if (!gpsInitialized) {
		gpsInitialized = true;
		demo.origin = { name: 'Your location', coordinate: demo.gpsPosition };
		routeFromGps(demo.gpsPosition);
		lastGpsReroute = 0;
		return;
	}
	updateGpsProgress();
}

export function updateGpsProgress() {
	if (
		!ownRoad ||
		demo.busy ||
		!demo.gpsPosition ||
		!demo.playing ||
		!demo.gpsTimestamp ||
		Date.now() - demo.gpsTimestamp > 15000
	)
		return;
	const match = matchGpsToRoute(ownRoad.polyline, demo.gpsPosition, demo.progress);
	demo.offRoute = match.distance > Math.max(50, demo.gpsAccuracy * 1.5);
	if (demo.offRoute) {
		demo.gpsMessage = 'Off route — updating directions';
		if (Date.now() - lastGpsReroute >= 10000) routeFromGps(demo.gpsPosition);
		return;
	}
	demo.gpsMessage = '';
	demo.progress = match.progress;
	const endpoint = ownRoad.polyline.at(-1)!;
	if (
		demo.gpsAccuracy <= 30 &&
		total - demo.progress <= 30 &&
		haversineDistanceKm(demo.gpsPosition, endpoint) * 1000 <= 30
	) {
		demo.gpsArrived = true;
		demo.progress = total;
		demo.playing = false;
	}
}

export function changeWaypoint(which: 'origin' | 'destination', value: Waypoint) {
	if (!editable) return;
	rerouteGeneration++;
	demo.playing = false;
	demo.started = false;
	demo.progress = 0;
	demo.completedMeters = 0;
	demo.routingStart = null;
	demo.fixture = false;
	demo.candidates = [];
	demo.roads = [];
	demo.routeError = '';
	if (which === 'origin') demo.origin = value;
	else demo.destination = value;
}

export function mapPick(point: Coordinate) {
	if (layout.picking === 'origin' || layout.picking === 'destination')
		changeWaypoint(layout.picking, {
			name: `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`,
			coordinate: point
		});
	else if (layout.picking) {
		demo.picked = { kind: layout.picking, center: point, token: Date.now() };
		setConfiguration(true);
	}
	layout.picking = null;
}

export function locate() {
	if (!navigator.geolocation) {
		demo.notice = 'Location is unavailable in this browser.';
		return;
	}
	demo.notice = 'Finding your location…';
	const generation = routeGeneration;
	navigator.geolocation.getCurrentPosition(
		(positionFix) => {
			if (generation !== routeGeneration || !editable) return;
			changeWaypoint('origin', {
				name: 'Your location',
				coordinate: [positionFix.coords.latitude, positionFix.coords.longitude]
			});
			demo.notice = 'Origin updated. Choose live GPS travel or demo playback.';
		},
		() => (demo.notice = 'Location denied or unavailable. Choose a preset or map point.'),
		{ timeout: 8000 }
	);
}

export async function applyConditions(next: Conditions, revision: number, preset?: DemoScenario) {
	if (demo.offlineDemo && demo.localSimulation) {
		try {
			const validated = validateConditions(preset ? scenarioConditions(preset) : next);
			demo.localSimulation = {
				revision: demo.localSimulation.revision + 1,
				conditions: { ...validated, trafficSimulation: true, floodSimulation: true },
				updatedAt: new Date().toISOString()
			};
			demo.error = '';
			return true;
		} catch (error) {
			demo.error = error instanceof Error ? error.message : 'Invalid local conditions';
			return false;
		}
	}
	if (!navigator.onLine) {
		demo.error = 'Internet is needed to publish shared changes.';
		return false;
	}
	try {
		receive(await requestJson('/api/simulation', 'PATCH', { conditions: next, revision, preset }, receive));
		demo.error = '';
		return true;
	} catch (error) {
		demo.error = error instanceof Error ? error.message : 'Could not publish changes.';
		try {
			receive(await requestJson('/api/simulation', 'GET', undefined, receive));
		} catch {
			// Keep the local error; a later poll may recover.
		}
		return false;
	}
}

export async function findAlternative(fasterOnly = false) {
	rerouteAbort?.abort();
	if (!ownRoad || !editable) return;
	if (demo.offlineDemo && (demo.progress > 0 || demo.roads.length < 2)) {
		demo.notice =
			'New routes need internet. Restart the example trip to compare bundled alternatives.';
		return;
	}
	demo.rerouting = true;
	demo.notice = '';
	if (demo.progress > 0 && demo.playing && !gpsTravel) {
		demo.playing = false;
		demo.notice = 'Conditions changed. Travel paused while checking alternatives.';
	}
	const version = ++rerouteGeneration;
	const current = positionAt(ownRoad.polyline, demo.progress);
	const currentRoad = ownRoad;
	const currentPath = remainingPath(currentRoad.polyline, demo.progress);
	const atStart = demo.progress === 0;
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), 18000);
	rerouteAbort = abort;
	try {
		const result =
			atStart && demo.roads.length > 1
				? demo.roads
				: await loadRoadRoutes(
						current,
						demo.destination.coordinate,
						conditions.trafficSimulation,
						abort.signal,
						demo.offlineDemo
					);
		if (version !== rerouteGeneration || disposed) return;
		demo.candidates = rankSimulationRoutes(
			result,
			conditions,
			vehicle.maxSafeWaterDepthCm,
			vehicle.id
		)
			.filter(
				(item) =>
					!item.blocked &&
					!samePolyline(item.road.polyline, currentPath) &&
					(!atStart || item.road.key !== currentRoad.key) &&
					(!fasterOnly || blocked || item.seconds < remainingSeconds)
			)
			.map((item) => item.road);
		if (!demo.candidates.length && blocked && conditions.floodSimulation && !demo.offlineDemo) {
			demo.notice = 'Searching nearby roads around the simulated flooding…';
			const hazards = floodZones(conditions.zones).filter(
				(zone) => zone.depthCm > vehicle.maxSafeWaterDepthCm
			);
			const detours = await fetchFloodDetours(
				current,
				demo.destination.coordinate,
				currentPath,
				hazards,
				abort.signal
			);
			if (version !== rerouteGeneration || disposed) return;
			demo.candidates = rankSimulationRoutes(
				detours,
				conditions,
				vehicle.maxSafeWaterDepthCm,
				vehicle.id
			)
				.filter((route) => !route.blocked)
				.map((route) => route.road);
			demo.notice = demo.candidates.length
				? 'Found a road detour avoiding the blocking simulated flood zones. ETA uses basic road estimates.'
				: 'No passable detour found in the nearby roads checked. Try another start or destination, or review the simulated flood areas.';
		} else if (!demo.candidates.length)
			demo.notice = blocked
				? 'No passable alternative available among returned roads. Travel stays paused.'
				: fasterOnly
					? 'No faster alternative available among returned roads.'
					: 'No different passable route returned by the routing service.';
	} catch (error) {
		if (version === rerouteGeneration)
			demo.notice = error instanceof Error ? error.message : 'Could not find an alternative.';
	} finally {
		clearTimeout(timer);
		if (rerouteAbort === abort) rerouteAbort = null;
		if (version === rerouteGeneration) demo.rerouting = false;
	}
}

export async function findObservedAlternative() {
	if (!ownRoad || !canAvoidObserved || demo.rerouting) return;
	rerouteAbort?.abort();
	const abort = new AbortController();
	rerouteAbort = abort;
	const version = ++rerouteGeneration;
	const from: Coordinate = [...position];
	const polygons = observedAvoidance.flatMap((feature) =>
		feature.geometry.coordinates.map((polygon) => ({
			type: 'MultiPolygon' as const,
			coordinates: [polygon]
		}))
	);
	const hazards = floodSimulation
		? floodZones(conditions.zones).filter((zone) => zone.depthCm > vehicle.maxSafeWaterDepthCm)
		: [];
	demo.rerouting = true;
	demo.candidates = [];
	try {
		const routes = await fetchFloodDetours(
			from,
			demo.destination.coordinate,
			observedPath,
			hazards,
			abort.signal,
			polygons
		);
		if (version !== rerouteGeneration || disposed) return;
		if (haversineDistanceKm(from, position) * 1000 > 30) {
			demo.notice = 'Your position changed. Search again from your current location.';
			return;
		}
		demo.candidates = routes;
		demo.notice = routes.length
			? 'Alternative avoids the recent satellite flood polygons. Other road conditions remain unconfirmed.'
			: 'No alternative found in the nearby roads checked. This does not prove that no detour exists.';
	} catch (error) {
		if (version === rerouteGeneration)
			demo.notice = error instanceof Error ? error.message : 'Alternative search unavailable.';
	} finally {
		if (version === rerouteGeneration) demo.rerouting = false;
		if (rerouteAbort === abort) rerouteAbort = null;
	}
}

export function acceptAlternative(road: RoadRoute) {
	rerouteAbort?.abort();
	void setMobilePanel(null, true);
	rerouteGeneration++;
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

export function startOfflineDemo() {
	stopTrip();
	demo.offlineDemo = true;
	demo.localSimulation = {
		revision: 0,
		conditions: scenarioConditions('dry'),
		updatedAt: new Date().toISOString()
	};
	demo.requestedMode = 'demo';
	demo.origin = initialOrigin();
	demo.destination = initialDestination();
	demo.fixture = true;
	demo.roads = DEMO_ROADS;
	demo.selectedKey = DEMO_ROADS[0].key;
	demo.previewZones = null;
	setConfiguration(false);
	demo.picked = null;
	demo.selectedZone = null;
	demo.syncError = '';
	demo.error = '';
	demo.routeError = '';
	demo.rainfallError = '';
	demo.notice = '';
}

export function exitOfflineDemo() {
	if (!pwaState.online) return;
	stopTrip();
	demo.offlineDemo = false;
	demo.localSimulation = null;
	demo.fixture = false;
	demo.requestedMode = '';
	demo.previewZones = null;
	setConfiguration(false);
	demo.roads = [];
	void syncConditions();
}

export function loadExampleTrip() {
	stopTrip();
	demo.origin = initialOrigin();
	demo.destination = initialDestination();
	demo.fixture = trafficSimulation;
	demo.roads = DEMO_ROADS;
	demo.selectedKey = DEMO_ROADS[0].key;
}

export function stopTrip() {
	demo.gpsPosition = null;
	gpsInitialized = false;
	demo.gpsTimestamp = 0;
	demo.gpsMessage = '';
	demo.gpsArrived = false;
	demo.offRoute = false;
	rerouteGeneration++;
	demo.playing = false;
	demo.started = false;
	demo.progress = 0;
	demo.completedMeters = 0;
	demo.routingStart = null;
	demo.routeRequest++;
	demo.lastSpeech = '';
}

export function selectRoute(road: RoadRoute) {
	demo.selectedKey = road.key;
	demo.progress = 0;
	void setMobilePanel(null, true);
}

export function swapWaypoints() {
	const start = demo.origin;
	const end = demo.destination;
	changeWaypoint('origin', end);
	changeWaypoint('destination', start);
}

export function togglePlaying() {
	demo.playing = !demo.playing;
	demo.candidates = [];
	rerouteGeneration++;
	demo.rerouting = false;
}

export function bumpRerouteSearch() {
	rerouteAbort?.abort();
	demo.candidates = [];
	rerouteGeneration++;
	demo.rerouting = false;
	if (!gpsTravel && ownRoad && !arrived && (blocked || (evaluation?.delaySeconds || 0) > 0))
		void findAlternative(true);
}

export function bindRouteFetch() {
	if (!demo.mounted || !sharedReady) return;
	const start = demo.routingStart || demo.origin.coordinate;
	const end = demo.destination.coordinate;
	const simulated = trafficSimulation;
	const useFixture = demo.fixture;
	void demo.routeRequest;
	const generation = ++routeGeneration;
	const abort = new AbortController();
	let cancelled = false;
	if (useFixture) {
		demo.roads = DEMO_ROADS;
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
			if (!cancelled && generation === routeGeneration) {
				demo.roads = result;
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
				if (!demo.routeError && demo.started && gpsTravel && demo.gpsPosition) updateGpsProgress();
			}
		});
	return () => {
		cancelled = true;
		abort.abort();
		clearTimeout(timer);
	};
}

export function bindRainfallFetch() {
	if (!demo.mounted || floodSimulation || !demo.roads.length) {
		demo.assessment = null;
		demo.rainfallError = '';
		return;
	}
	const input = demo.roads;
	void demo.weatherRequest;
	let cancelled = false;
	const abort = new AbortController();
	demo.assessment = null;
	demo.rainfallError = '';
	const timer = setTimeout(() => abort.abort(), 120000);
	void loadRainfallAssessment(input, demoId(), abort.signal)
		.then((data) => {
			if (cancelled) return;
			demo.assessment = data;
			if (
				!data.hazards.verified ||
				data.weather.errors.length ||
				data.routes.some((route: { score: number | null }) => route.score === null)
			)
				demo.rainfallError =
					'Live rainfall assessment incomplete. GPS navigation remains available; flood conditions are unconfirmed.';
		})
		.catch((error) => {
			if (!cancelled) demo.rainfallError = error.message || 'Rainfall unavailable.';
		})
		.finally(() => clearTimeout(timer));
	return () => {
		cancelled = true;
		abort.abort();
		clearTimeout(timer);
	};
}

export function bindGpsWatch() {
	if (!demo.mounted || !demo.started || !demo.playing || !gpsTravel) return;
	let active = true;
	const watch = navigator.geolocation.watchPosition(
		(fix) => {
			if (active) receiveGps(fix);
		},
		(error) => {
			if (!active) return;
			demo.gpsMessage =
				error.code === 1
					? 'Location permission denied. Allow location, then Resume.'
					: 'GPS unavailable — waiting for location';
			if (error.code === 1) demo.playing = false;
		},
		{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
	);
	return () => {
		active = false;
		navigator.geolocation.clearWatch(watch);
	};
}

export function mountDemo() {
	demo.mounted = true;
	pwaState.online = navigator.onLine;
	if (new URLSearchParams(location.search).get('offline-demo') === '1') startOfflineDemo();
	void syncConditions();
	const ticker = setInterval(tickDemoClock, 250);
	const poll = setInterval(() => {
		if (!document.hidden) void syncConditions();
	}, 2000);
	const refresh = setInterval(() => {
		if (document.hidden || !navigator.onLine || demo.offlineDemo) return;
		if (!conditions.trafficSimulation && (!demo.playing || gpsTravel)) {
			if (demo.started && ownRoad && !arrived) rebaseAtCurrentPosition();
			demo.routeRequest++;
		}
		if (!conditions.floodSimulation) demo.weatherRequest++;
	}, 120000);
	const focus = () => {
		void syncConditions();
	};
	const visibility = () => {
		if (document.hidden && !gpsTravel) demo.playing = false;
		else focus();
	};
	const offline = () => {
		demo.connected = false;
		if (!gpsTravel && !demo.offlineDemo) demo.playing = false;
	};
	window.addEventListener('floodnav:offline-demo', startOfflineDemo);
	window.addEventListener('focus', focus);
	window.addEventListener('online', focus);
	window.addEventListener('offline', offline);
	document.addEventListener('visibilitychange', visibility);
	return () => {
		disposed = true;
		rerouteAbort?.abort();
		clearInterval(ticker);
		clearInterval(poll);
		clearInterval(refresh);
		pwaState.busy = false;
		window.removeEventListener('floodnav:offline-demo', startOfflineDemo);
		window.removeEventListener('focus', focus);
		window.removeEventListener('online', focus);
		window.removeEventListener('offline', offline);
		document.removeEventListener('visibilitychange', visibility);
	};
}

export { beginPick };
