import { DEMO_ROADS, scenarioConditions } from '$lib/data/demoScenarios';
import { advanceTimed } from '$lib/services/demoSimulation';
import { pwaState } from '$lib/services/pwaState.svelte';
import { type RoadRoute } from '$lib/services/routingService';
import { layout, setConfiguration, setMobilePanel } from '$lib/states/layout.svelte';
import type { Waypoint } from '$lib/types/demo';
import type { Coordinate } from '$lib/types/navigation';
import { initialOrigin, initialDestination, demo, navigation } from './core.svelte';
import { runtime } from './runtime';
import { syncConditions } from './shared.svelte';

export function tickDemoClock() {
	demo.clock = Date.now();
	if (!runtime.lastSnapshot || demo.clock - runtime.lastSnapshot > 15000) demo.connected = false;
	if (!demo.connected && !navigation.gpsTravel && !demo.offlineDemo) demo.playing = false;
	if (
		!navigation.gpsTravel &&
		demo.playing &&
		navigation.editable &&
		!demo.busy &&
		!navigation.blocked &&
		!navigation.liveUnavailable &&
		!document.hidden
	)
		demo.progress = advanceTimed(navigation.timing, demo.progress, 0.25 * demo.playbackSpeed);
	if (
		demo.started &&
		navigation.gpsTravel &&
		demo.playing &&
		demo.gpsTimestamp &&
		demo.clock - demo.gpsTimestamp > 15000
	)
		demo.gpsMessage = 'GPS signal stale — waiting for location';
	if (navigation.arrived) demo.playing = false;
}

export function startTrip() {
	void setMobilePanel(null);
	demo.requestedMode = navigation.travelMode;
	if (navigation.gpsTravel && (!window.isSecureContext || !navigator.geolocation)) {
		demo.notice = 'Live GPS needs HTTPS (or localhost) and a browser with location support.';
		return;
	}
	runtime.gpsInitialized = false;
	demo.gpsTimestamp = 0;
	demo.gpsArrived = false;
	demo.gpsPosition = null;
	demo.offRoute = false;
	demo.gpsMessage = navigation.gpsTravel ? 'Finding your location…' : '';
	demo.candidates = [];
	runtime.rerouteGeneration++;
	demo.rerouting = false;
	demo.started = true;
	layout.plannerCollapsed = true;
	demo.playing = true;
}

export function changeWaypoint(which: 'origin' | 'destination', value: Waypoint) {
	if (!navigation.editable) return;
	runtime.rerouteGeneration++;
	demo.playing = false;
	demo.started = false;
	demo.progress = 0;
	demo.completedMeters = 0;
	demo.routingStart = null;
	demo.fixture = false;
	demo.candidates = [];
	demo.roads = [];
	demo.originalRoads = [];
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
	const generation = runtime.routeGeneration;
	navigator.geolocation.getCurrentPosition(
		(positionFix) => {
			if (generation !== runtime.routeGeneration || !navigation.editable) return;
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
	demo.originalRoads = DEMO_ROADS;
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
	demo.originalRoads = [];
	void syncConditions();
}

export function loadExampleTrip() {
	stopTrip();
	demo.origin = initialOrigin();
	demo.destination = initialDestination();
	demo.fixture = navigation.trafficSimulation;
	demo.roads = DEMO_ROADS;
	demo.originalRoads = DEMO_ROADS;
	demo.selectedKey = DEMO_ROADS[0].key;
}

export function stopTrip() {
	demo.originalRoads = [];
	demo.gpsPosition = null;
	runtime.gpsInitialized = false;
	demo.gpsTimestamp = 0;
	demo.gpsMessage = '';
	demo.gpsArrived = false;
	demo.offRoute = false;
	runtime.rerouteGeneration++;
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
	runtime.rerouteGeneration++;
	demo.rerouting = false;
}
