<script lang="ts">
	import { pwaState } from '$lib/services/pwaState.svelte';
	import { validateConditions } from '$lib/services/simulationValidation';
	import { scenarioConditions } from '$lib/data/demoScenarios';
	import { matchGpsToRoute, usableGpsFix } from '$lib/services/gpsNavigation';
	import { haversineDistanceKm } from '$lib/services/trafficService';
	import { VEHICLE_TRAVEL_PROFILES } from '$lib/services/demoSimulation';
	import { onMount, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import DemoMap from './DemoMap.svelte';
	import LocationPicker from './LocationPicker.svelte';
	import ConditionsEditor from './ConditionsEditor.svelte';
	import type { Conditions, SimulationState, SimulationZone, Waypoint } from '$lib/types/demo';
	import type { Coordinate, DemoScenario } from '$lib/types/navigation';
	import type { ExposureAssessment } from '$lib/types/rainfall';
	import { DEFAULT_VEHICLE_CATEGORY, VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
	import { DEMO_ORIGIN, DEMO_DESTINATION, DEMO_ROADS } from '$lib/data/demoScenarios';
	import {
		cumulativeDistances,
		fetchRoadRoutes,
		positionAt,
		type RoadRoute
	} from '$lib/services/routingService';
	import {
		advanceTimed,
		remainingPath,
		evaluateSimulation,
		rankSimulationRoutes,
		formatTravelTime
	} from '$lib/services/demoSimulation';
	import { speechService } from '$lib/services/speechService';
	import { sampleRate } from '$lib/services/rainfallAssessment';
	import { demoId } from '$lib/services/demoId';
	import './demo.css';

	const initialOrigin = (): Waypoint => ({
		name: 'Fuente Osmeña Circle',
		coordinate: [...DEMO_ORIGIN]
	});
	const initialDestination = (): Waypoint => ({
		name: 'SM City Cebu',
		coordinate: [...DEMO_DESTINATION]
	});
	let mounted = $state(false),
		shared = $state<SimulationState | null>(null),
		connected = $state(false);
	let offlineDemo = $state(false);
	let localSimulation = $state<SimulationState | null>(null);
	const online = $derived(pwaState.online);
	const currentSimulation = $derived(offlineDemo ? localSimulation : shared);
	$effect(() => {
		pwaState.busy = started || previewZones !== null;
	});

	let origin = $state(initialOrigin()),
		destination = $state(initialDestination()),
		vehicleId = $state(DEFAULT_VEHICLE_CATEGORY.id);
	let roads = $state<RoadRoute[]>([]),
		selectedKey = $state(''),
		progress = $state(0),
		completedMeters = $state(0);
	let playbackSpeed = $state(1);
	let requestedMode = $state<'gps' | 'demo' | ''>('');
	let gpsPosition = $state<Coordinate | null>(null),
		gpsAccuracy = $state(0),
		gpsMessage = $state(''),
		gpsArrived = $state(false),
		gpsTimestamp = $state(0),
		offRoute = $state(false);
	let gpsInitialized = false,
		lastGpsReroute = 0;

	let playing = $state(false),
		started = $state(false),
		busy = $state(false),
		muted = $state(false),
		collapsed = $state(false);
	let notice = $state(''),
		error = $state(''),
		routeError = $state(''),
		trafficStatus = $state(''),
		rainfallError = $state('');
	let assessment = $state<ExposureAssessment | null>(null),
		routingStart = $state<Coordinate | null>(null);
	let routeRequest = $state(0),
		weatherRequest = $state(0),
		fixture = $state(false);
	let picking = $state<'origin' | 'destination' | 'traffic' | 'flood' | null>(null),
		picked = $state<{ kind: 'traffic' | 'flood'; center: Coordinate; token: number } | null>(null),
		selectedZone = $state<string | null>(null);
	let candidates = $state<RoadRoute[]>([]),
		previewZones = $state<SimulationZone[] | null>(null),
		rerouting = $state(false),
		drawerOpen = $state(false),
		clock = $state(Date.now());
	let routeGeneration = 0,
		rerouteGeneration = 0,
		lastSpeech = '',
		lastSnapshot = 0;
	let syncing = false,
		disposed = false;
	let syncError = $state('');
	const conditions = $derived(
		currentSimulation?.conditions || { trafficSimulation: false, floodSimulation: false, zones: [] }
	);
	const trafficSimulation = $derived(conditions.trafficSimulation);
	const floodSimulation = $derived(conditions.floodSimulation);
	const travelMode = $derived(
		requestedMode || (trafficSimulation || floodSimulation ? 'demo' : 'gps')
	);
	const gpsTravel = $derived(travelMode === 'gps');
	const editable = $derived(mounted && (offlineDemo || connected));
	const sharedReady = $derived(!!currentSimulation);
	const vehicle = $derived(
		VEHICLE_CATEGORIES.find((v) => v.id === vehicleId) || DEFAULT_VEHICLE_CATEGORY
	);
	const ownRoad = $derived(roads.find((r) => r.key === selectedKey) || roads[0] || null);
	const active = $derived(ownRoad);
	const currentProgress = $derived(progress);
	const displayedOrigin = $derived(origin);
	const displayedDestination = $derived(destination);
	const position = $derived(
		started && gpsTravel && gpsPosition
			? gpsPosition
			: ownRoad
				? positionAt(ownRoad.polyline, progress)
				: origin.coordinate
	);
	const visibleZones = $derived(
		(drawerOpen || picking === 'traffic' || picking === 'flood') && previewZones
			? previewZones
			: conditions.zones.filter((z) => (z.kind === 'traffic' ? trafficSimulation : floodSimulation))
	);
	const evaluation = $derived(
		ownRoad
			? evaluateSimulation(ownRoad, conditions, vehicle.maxSafeWaterDepthCm, progress, vehicle.id)
			: null
	);
	const ranked = $derived(
		rankSimulationRoutes(roads, conditions, vehicle.maxSafeWaterDepthCm, vehicle.id)
	);
	const timing = $derived(evaluation?.segments || []);
	const total = $derived(ownRoad ? cumulativeDistances(ownRoad.polyline).at(-1) || 0 : 0);
	const remainingSeconds = $derived(evaluation?.seconds || 0);
	const blocked = $derived(evaluation?.blocked || false);
	const arrived = $derived(started && gpsTravel ? gpsArrived : total > 0 && progress >= total);
	const staleTraffic = $derived(
		!conditions.trafficSimulation &&
			!!ownRoad?.fetchedAt &&
			clock - Date.parse(ownRoad.fetchedAt) > 300000
	);
	const staleRainfall = $derived(
		!floodSimulation &&
			!!assessment &&
			(clock - Date.parse(assessment.assessedAt) > 15 * 60000 ||
				assessment.weather.samples.some((s) => sampleRate(s, clock) === null))
	);
	const liveUnavailable = $derived(
		!!routeError ||
			staleTraffic ||
			staleRainfall ||
			(!conditions.floodSimulation && (!assessment || !!rainfallError))
	);
	const nextStep = $derived(
		active?.steps.find((s) => s.progressMeters > currentProgress + 5) || active?.steps.at(-1)
	);
	const status = $derived(
		arrived
			? 'arrived'
			: started && gpsTravel
				? playing
					? gpsMessage || (busy ? 'updating route' : 'GPS tracking')
					: 'paused'
				: blocked
					? 'blocked'
					: playing
						? 'running'
						: started
							? 'paused'
							: 'idle'
	);
	const travelStarted = $derived(started);
	const remainingMeters = $derived(Math.max(0, total - progress));
	const alternative = $derived(
		candidates[0] ||
			(progress === 0
				? ranked.find(
						(r) =>
							r.road.key !== ownRoad?.key && !r.blocked && (blocked || r.seconds < remainingSeconds)
					)?.road
				: null) ||
			null
	);
	const alternativeEvaluation = $derived(
		alternative
			? evaluateSimulation(alternative, conditions, vehicle.maxSafeWaterDepthCm, 0, vehicle.id)
			: null
	);

	async function api(path: string, method = 'GET', payload?: unknown) {
		const response = await fetch(path, {
			method,
			headers: payload ? { 'Content-Type': 'application/json' } : {},
			body: payload ? JSON.stringify(payload) : undefined,
			signal: AbortSignal.timeout(20000)
		});
		const data = await response.json();
		if (!response.ok) {
			if (response.status === 409 && data.latest) receive(data.latest);
			throw new Error(data.error || 'Request failed.');
		}
		return data;
	}
	function receive(next: SimulationState) {
		lastSnapshot = Date.now();
		connected = true;
		syncError = '';
		if (shared && next.revision <= shared.revision) return;
		if (offlineDemo) {
			shared = next;
			return;
		}
		const previous = shared?.conditions;
		if (
			previous &&
			(previous.trafficSimulation !== next.conditions.trafficSimulation ||
				previous.floodSimulation !== next.conditions.floodSimulation)
		) {
			if (!gpsTravel) playing = false;
			rebaseAtCurrentPosition();
			fixture = false;
			routeRequest++;
			notice = gpsTravel
				? 'Shared data source changed. GPS tracking continues.'
				: 'Data source changed. Review the remaining route, then resume.';
		}
		shared = next;
		candidates = [];
		rerouting = false;
		rerouteGeneration++;
	}
	async function syncConditions() {
		if (syncing || disposed || !navigator.onLine) return;
		syncing = true;
		try {
			const next = await api('/api/simulation');
			if (!disposed) receive(next);
		} catch (e) {
			if (!disposed) syncError = e instanceof Error ? e.message : 'Shared conditions unavailable.';
		} finally {
			syncing = false;
		}
	}
	function rebaseAtCurrentPosition() {
		const road = ownRoad,
			moved = progress;
		routingStart =
			gpsTravel && gpsPosition
				? gpsPosition
				: road
					? positionAt(road.polyline, moved)
					: origin.coordinate;
		if (road && moved > 0) {
			const length = cumulativeDistances(road.polyline).at(-1) || 1;
			const path = remainingPath(road.polyline, moved);
			if (path.length > 1) {
				const remainingRoad: RoadRoute = {
					...road,
					polyline: path,
					distanceMeters: Math.max(0, length - moved),
					durationSeconds: road.durationSeconds * Math.max(0, 1 - moved / length),
					steps: road.steps
						.filter((s) => s.progressMeters >= moved)
						.map((s) => ({ ...s, progressMeters: s.progressMeters - moved }))
				};
				roads = [remainingRoad];
				selectedKey = road.key;
			}
		}
		completedMeters += moved;
		progress = 0;
	}
	onMount(() => {
		mounted = true;
		pwaState.online = navigator.onLine;
		if (new URLSearchParams(location.search).get('offline-demo') === '1') startOfflineDemo();
		void syncConditions();
		const ticker = setInterval(() => {
			clock = Date.now();
			if (!lastSnapshot || clock - lastSnapshot > 15000) connected = false;
			if (!connected && !gpsTravel && !offlineDemo) playing = false;
			if (
				!gpsTravel &&
				playing &&
				editable &&
				!busy &&
				!blocked &&
				!liveUnavailable &&
				!document.hidden
			)
				progress = advanceTimed(timing, progress, 0.25 * playbackSpeed);
			if (started && gpsTravel && playing && gpsTimestamp && clock - gpsTimestamp > 15000)
				gpsMessage = 'GPS signal stale — waiting for location';
			if (arrived) playing = false;
		}, 250);
		const poll = setInterval(() => {
			if (!document.hidden) void syncConditions();
		}, 2000);
		const refresh = setInterval(() => {
			if (document.hidden || !navigator.onLine || offlineDemo) return;
			if (!conditions.trafficSimulation && (!playing || gpsTravel)) {
				if (started && ownRoad && !arrived) rebaseAtCurrentPosition();
				routeRequest++;
			}
			if (!conditions.floodSimulation) weatherRequest++;
		}, 120000);
		const focus = () => {
			void syncConditions();
		};
		const visibility = () => {
			if (document.hidden && !gpsTravel) playing = false;
			else focus();
		};
		const offline = () => {
			connected = false;
			if (!gpsTravel && !offlineDemo) playing = false;
		};
		window.addEventListener('floodnav:offline-demo', startOfflineDemo);
		window.addEventListener('focus', focus);
		window.addEventListener('online', focus);
		window.addEventListener('offline', offline);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			disposed = true;
			clearInterval(ticker);
			clearInterval(poll);
			clearInterval(refresh);
			pwaState.busy = false;
			window.removeEventListener('floodnav:offline-demo', startOfflineDemo);
			window.removeEventListener('focus', focus);
			window.removeEventListener('online', focus);
			window.removeEventListener('offline', offline);
			document.removeEventListener('visibilitychange', visibility);
			speechService.cancel();
		};
	});
	async function getRoutes(
		start: Coordinate,
		end: Coordinate,
		simulated: boolean,
		signal: AbortSignal
	) {
		if (!navigator.onLine || offlineDemo)
			throw new Error('Internet is needed for new routes. Use the bundled offline demo.');
		if (simulated) return fetchRoadRoutes(start, end, signal);
		try {
			const response = await fetch('/api/demo/routes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ origin: start, destination: end }),
				signal
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			return data as RoadRoute[];
		} catch (error) {
			if (signal.aborted) throw error;
			// Basic road routing remains available without live traffic. The UI labels the fallback.
			return fetchRoadRoutes(start, end, signal);
		}
	}
	$effect(() => {
		if (!mounted || !sharedReady) return;
		const start = routingStart || origin.coordinate,
			end = destination.coordinate,
			simulated = trafficSimulation,
			useFixture = fixture;
		void routeRequest;
		const generation = ++routeGeneration;
		const abort = new AbortController();
		let disposed = false;
		if (useFixture) {
			roads = DEMO_ROADS;
			selectedKey = DEMO_ROADS[0].key;
			routeError = '';
			busy = false;
			return;
		}
		busy = true;
		routeError = '';
		const timer = setTimeout(() => abort.abort(), 18000);
		void getRoutes(start, end, simulated, abort.signal)
			.then((result) => {
				if (!disposed && generation === routeGeneration) {
					roads = result;
					selectedKey = result[0]?.key || '';
					candidates = [];
				}
			})
			.catch((e) => {
				if (!disposed)
					routeError = abort.signal.aborted
						? 'Routing timed out. Retry or load a demo preset from simulation controls.'
						: e.message;
			})
			.finally(() => {
				clearTimeout(timer);
				if (!disposed) {
					busy = false;
					if (!routeError && started && gpsTravel && gpsPosition) updateGpsProgress();
				}
			});
		return () => {
			disposed = true;
			abort.abort();
			clearTimeout(timer);
		};
	});
	$effect(() => {
		const simulated = floodSimulation;
		if (!mounted || simulated || !roads.length) {
			assessment = null;
			rainfallError = '';
			return;
		}
		const input = roads;
		void weatherRequest;
		let disposed = false;
		const abort = new AbortController();
		assessment = null;
		rainfallError = '';
		const timer = setTimeout(() => abort.abort(), 120000);
		void fetch('/api/assessments', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				roads: input,
				assessmentId: demoId(),
				loggingEnabled: false
			}),
			signal: abort.signal
		})
			.then(async (response) => {
				const data = await response.json();
				if (!response.ok) throw new Error(data.error);
				if (!disposed) {
					assessment = data;
					if (
						!data.hazards.verified ||
						data.weather.errors.length ||
						data.routes.some((r: { score: number | null }) => r.score === null)
					)
						rainfallError =
							'Live rainfall assessment incomplete. GPS navigation remains available; flood conditions are unconfirmed.';
				}
			})
			.catch((e) => {
				if (!disposed) rainfallError = e.message || 'Rainfall unavailable.';
			})
			.finally(() => clearTimeout(timer));
		return () => {
			disposed = true;
			abort.abort();
			clearTimeout(timer);
		};
	});
	$effect(() => {
		if (!gpsTravel && (blocked || !editable || liveUnavailable)) playing = false;
	});
	$effect(() => {
		if (
			!playing ||
			muted ||
			!nextStep ||
			busy ||
			(gpsTravel && (gpsMessage || offRoute || !gpsTimestamp))
		)
			return;
		const key = `${active?.key}:${nextStep.id}`;
		if (lastSpeech !== key) {
			lastSpeech = key;
			untrack(() => speechService.speak(nextStep.instruction));
		}
	});
	$effect(() => {
		if (blocked && mounted && !muted && !gpsTravel)
			untrack(() =>
				speechService.speak('Simulated flood ahead. Travel paused. Check an alternative route.')
			);
	});
	function startTrip() {
		requestedMode = travelMode;
		if (gpsTravel && (!window.isSecureContext || !navigator.geolocation)) {
			notice = 'Live GPS needs HTTPS (or localhost) and a browser with location support.';
			return;
		}
		gpsInitialized = false;
		gpsTimestamp = 0;
		gpsArrived = false;
		gpsPosition = null;
		offRoute = false;
		gpsMessage = gpsTravel ? 'Finding your location…' : '';
		candidates = [];
		rerouteGeneration++;
		rerouting = false;
		started = true;
		playing = true;
	}
	function routeFromGps(point: Coordinate) {
		completedMeters += progress;
		progress = 0;
		routingStart = point;
		fixture = false;
		candidates = [];
		rerouteGeneration++;
		routeRequest++;
		lastGpsReroute = Date.now();
	}
	function receiveGps(fix: GeolocationPosition) {
		if (!usableGpsFix(fix)) {
			gpsMessage = 'GPS accuracy is low — waiting for a reliable location';
			return;
		}
		if (fix.timestamp < gpsTimestamp) return;
		gpsPosition = [fix.coords.latitude, fix.coords.longitude];
		gpsAccuracy = fix.coords.accuracy;
		gpsTimestamp = fix.timestamp;
		gpsMessage = '';
		if (!gpsInitialized) {
			gpsInitialized = true;
			origin = { name: 'Your location', coordinate: gpsPosition };
			routeFromGps(gpsPosition);
			lastGpsReroute = 0;
			return;
		}
		updateGpsProgress();
	}
	function updateGpsProgress() {
		if (
			!ownRoad ||
			busy ||
			!gpsPosition ||
			!playing ||
			!gpsTimestamp ||
			Date.now() - gpsTimestamp > 15000
		)
			return;
		const match = matchGpsToRoute(ownRoad.polyline, gpsPosition, progress);
		offRoute = match.distance > Math.max(50, gpsAccuracy * 1.5);
		if (offRoute) {
			gpsMessage = 'Off route — updating directions';
			if (Date.now() - lastGpsReroute >= 10000) routeFromGps(gpsPosition);
			return;
		}
		gpsMessage = '';
		progress = match.progress;
		const endpoint = ownRoad.polyline.at(-1)!;
		if (
			gpsAccuracy <= 30 &&
			total - progress <= 30 &&
			haversineDistanceKm(gpsPosition, endpoint) * 1000 <= 30
		) {
			gpsArrived = true;
			progress = total;
			playing = false;
		}
	}
	$effect(() => {
		if (!mounted || !started || !playing || !gpsTravel) return;
		let active = true;
		const watch = navigator.geolocation.watchPosition(
			(fix) => {
				if (active) receiveGps(fix);
			},
			(error) => {
				if (!active) return;
				gpsMessage =
					error.code === 1
						? 'Location permission denied. Allow location, then Resume.'
						: 'GPS unavailable — waiting for location';
				if (error.code === 1) playing = false;
			},
			{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
		);
		return () => {
			active = false;
			navigator.geolocation.clearWatch(watch);
		};
	});

	function changeWaypoint(which: 'origin' | 'destination', value: Waypoint) {
		if (!editable) return;
		rerouteGeneration++;
		playing = false;
		started = false;
		progress = 0;
		completedMeters = 0;
		routingStart = null;
		fixture = false;
		candidates = [];
		roads = [];
		routeError = '';
		if (which === 'origin') origin = value;
		else destination = value;
	}
	function mapPick(point: Coordinate) {
		if (picking === 'origin' || picking === 'destination')
			changeWaypoint(picking, {
				name: `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`,
				coordinate: point
			});
		else if (picking) {
			picked = { kind: picking, center: point, token: Date.now() };
			drawerOpen = true;
		}
		picking = null;
	}
	function locate() {
		if (!navigator.geolocation) {
			notice = 'Location is unavailable in this browser.';
			return;
		}
		notice = 'Finding your location…';
		const generation = routeGeneration;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				if (generation !== routeGeneration || !editable) return;
				changeWaypoint('origin', {
					name: 'Your location',
					coordinate: [p.coords.latitude, p.coords.longitude]
				});
				notice = 'Origin updated. Choose live GPS travel or demo playback.';
			},
			() => (notice = 'Location denied or unavailable. Choose a preset or map point.'),
			{ timeout: 8000 }
		);
	}
	async function apply(conditions: Conditions, revision: number, preset?: DemoScenario) {
		if (offlineDemo && localSimulation) {
			try {
				const next = validateConditions(preset ? scenarioConditions(preset) : conditions);
				localSimulation = {
					revision: localSimulation.revision + 1,
					conditions: { ...next, trafficSimulation: true, floodSimulation: true },
					updatedAt: new Date().toISOString()
				};
				error = '';
				return true;
			} catch (e) {
				error = e instanceof Error ? e.message : 'Invalid local conditions';
				return false;
			}
		}
		if (!navigator.onLine) {
			error = 'Internet is needed to publish shared changes.';
			return false;
		}
		try {
			receive(await api('/api/simulation', 'PATCH', { conditions, revision, preset }));
			error = '';
			return true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not publish changes.';
			try {
				receive(await api('/api/simulation'));
			} catch {}
			return false;
		}
	}
	// Only condition, vehicle, and route changes trigger an automatic search, not every travel tick.
	$effect(() => {
		const revision = currentSimulation?.revision;
		void vehicleId;
		void roads;
		void selectedKey;
		if (revision === undefined || !editable || busy) return;
		untrack(() => {
			candidates = [];
			rerouteGeneration++;
			rerouting = false;
			if (!gpsTravel && ownRoad && !arrived && (blocked || (evaluation?.delaySeconds || 0) > 0))
				void findAlternative();
		});
	});
	async function findAlternative() {
		if (!ownRoad || !editable) return;
		if (offlineDemo && (progress > 0 || roads.length < 2)) {
			notice =
				'New routes need internet. Restart the example trip to compare bundled alternatives.';
			return;
		}
		rerouting = true;
		notice = '';
		// Keep candidate origins at the exact current position while the provider responds.
		if (progress > 0 && playing && !gpsTravel) {
			playing = false;
			notice = 'Conditions changed. Travel paused while checking alternatives.';
		}
		const version = ++rerouteGeneration;
		const current = positionAt(ownRoad.polyline, progress),
			currentRoad = ownRoad;
		const currentPath = remainingPath(currentRoad.polyline, progress);
		const atStart = progress === 0;
		const abort = new AbortController(),
			timer = setTimeout(() => abort.abort(), 18000);
		try {
			const result =
				atStart && roads.length > 1
					? roads
					: await getRoutes(
							current,
							destination.coordinate,
							conditions.trafficSimulation,
							abort.signal
						);
			if (version !== rerouteGeneration || disposed) return;
			candidates = rankSimulationRoutes(result, conditions, vehicle.maxSafeWaterDepthCm, vehicle.id)
				.filter(
					(r) =>
						!r.blocked &&
						JSON.stringify(r.road.polyline) !== JSON.stringify(currentPath) &&
						(!atStart || r.road.key !== currentRoad.key) &&
						(blocked || r.seconds < remainingSeconds)
				)
				.map((r) => r.road);
			if (!candidates.length)
				notice = blocked
					? 'No passable alternative available among returned roads. Travel stays paused.'
					: 'No faster alternative available among returned roads.';
		} catch (e) {
			if (version === rerouteGeneration)
				notice = e instanceof Error ? e.message : 'Could not find an alternative.';
		} finally {
			clearTimeout(timer);
			if (version === rerouteGeneration) rerouting = false;
		}
	}
	function acceptAlternative(road: RoadRoute) {
		rerouteGeneration++;
		rerouting = false;
		playing = false;
		completedMeters += progress;
		progress = 0;
		roads = [road];
		selectedKey = road.key;
		candidates = [];
		notice = 'Alternative selected. Resume when ready.';
		lastSpeech = '';
	}
	function startOfflineDemo() {
		stopTrip();
		offlineDemo = true;
		localSimulation = {
			revision: 0,
			conditions: scenarioConditions('dry'),
			updatedAt: new Date().toISOString()
		};
		requestedMode = 'demo';
		origin = initialOrigin();
		destination = initialDestination();
		fixture = true;
		roads = DEMO_ROADS;
		selectedKey = DEMO_ROADS[0].key;
		previewZones = null;
		drawerOpen = false;
		picked = null;
		selectedZone = null;
		syncError = '';
		error = '';
		routeError = '';
		rainfallError = '';
		notice = '';
	}
	function exitOfflineDemo() {
		if (!online) return;
		stopTrip();
		offlineDemo = false;
		localSimulation = null;
		fixture = false;
		requestedMode = '';
		previewZones = null;
		drawerOpen = false;
		roads = [];
		void syncConditions();
	}

	function loadExampleTrip() {
		stopTrip();
		origin = initialOrigin();
		destination = initialDestination();
		fixture = trafficSimulation;
		roads = DEMO_ROADS;
		selectedKey = DEMO_ROADS[0].key;
	}
	function stopTrip() {
		gpsPosition = null;
		gpsInitialized = false;
		gpsTimestamp = 0;
		gpsMessage = '';
		gpsArrived = false;
		offRoute = false;
		rerouteGeneration++;
		playing = false;
		started = false;
		progress = 0;
		completedMeters = 0;
		routingStart = null;
		routeRequest++;
		lastSpeech = '';
	}
</script>

<svelte:head
	><title>Directions · FloodNav</title><meta
		name="description"
		content="Cebu directions with live GPS tracking and shared demo conditions."
	/></svelte:head
>
<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') picking = null;
	}}
/>
<main class="demo-shell" class:configuration-open={drawerOpen}>
	<DemoMap
		origin={displayedOrigin.coordinate}
		destination={displayedDestination.coordinate}
		{position}
		followPosition={started && gpsTravel && playing && !!gpsPosition}
		route={active}
		{alternative}
		zones={visibleZones}
		picking={!!picking}
		liveTraffic={!conditions.trafficSimulation && online && !offlineDemo}
		offline={offlineDemo || !online}
		{assessment}
		onpick={mapPick}
		onzone={(id) => {
			selectedZone = id;
			drawerOpen = true;
		}}
		ontrafficstatus={(value) => (trafficStatus = value)}
	/>
	<div class="map-source-badges">
		{#if offlineDemo}<span>Offline demo · this device only</span>{/if}
		<span
			><i class:live={!conditions.trafficSimulation}></i>{conditions.trafficSimulation
				? 'Simulated traffic'
				: 'Live traffic'}</span
		><span
			><i class:live={!conditions.floodSimulation}></i>{conditions.floodSimulation
				? 'Simulated flooding'
				: 'Live rainfall'}</span
		>
		{#if previewZones && (drawerOpen || picking === 'traffic' || picking === 'flood')}<span
				>Unpublished preview · ETA uses applied conditions</span
			>{/if}
	</div>
	<aside class="directions-panel" class:traveling={travelStarted}>
		<header class="brand-header">
			<a href="/" class="brand"
				><span class="brand-mark"><Icon name="route" size={23} /></span>FloodNav<span
					class="brand-city">CEBU</span
				></a
			><span class="demo-label">{gpsTravel ? 'LIVE GPS' : 'TRAVEL DEMO'}</span>
		</header>
		{#if !travelStarted}
			<div class="planner-body">
				<div class="planner-title">
					<h1>Where to?</h1>
					<p>A clearer route through changing conditions.</p>
				</div>
				<div class="vehicle-options" role="group" aria-label="Vehicle">
					{#each VEHICLE_CATEGORIES as v}
						{@const profile = VEHICLE_TRAVEL_PROFILES[v.id]}
						{@const estimate = ownRoad
							? evaluateSimulation(ownRoad, conditions, v.maxSafeWaterDepthCm, progress, v.id)
							: null}
						<button
							class="vehicle-option"
							class:selected={vehicleId === v.id}
							aria-pressed={vehicleId === v.id}
							aria-label={profile.label}
							title={v.title}
							disabled={!editable}
							onclick={() => (vehicleId = v.id)}
						>
							<span class="vehicle-option-icon"><Icon name={profile.icon} size={22} /></span>
							<span class="vehicle-option-label">{profile.label}</span>
							<span class="vehicle-option-eta"
								>{busy
									? '…'
									: !estimate
										? '—'
										: estimate.blocked
											? 'Blocked'
											: `${Math.ceil(estimate.seconds / 60)} min`}</span
							>
						</button>
					{/each}
				</div>
				<p class="vehicle-estimate-note">Estimated vehicle timing · same driving route</p>
				<div class="waypoint-stack">
					<div class="waypoint-rail">
						<span class="origin-dot"></span><span class="rail-line"></span><Icon
							name="pin"
							size={20}
						/>
					</div>
					<div class="waypoint-editors">
						<LocationPicker
							label="Starting point"
							value={displayedOrigin}
							disabled={!editable || offlineDemo}
							onchoose={(p) => changeWaypoint('origin', p)}
							onpick={() => (picking = 'origin')}
							ongps={locate}
						/><LocationPicker
							label="Destination"
							value={displayedDestination}
							disabled={!editable || offlineDemo}
							onchoose={(p) => changeWaypoint('destination', p)}
							onpick={() => (picking = 'destination')}
						/>
					</div>
					<button
						class="swap-button icon-button"
						aria-label="Swap start and destination"
						disabled={!editable || offlineDemo}
						onclick={() => {
							const a = origin,
								b = destination;
							changeWaypoint('origin', b);
							changeWaypoint('destination', a);
						}}><Icon name="route" size={19} /></button
					>
				</div>
			</div>
			<div class="route-results" class:collapsed>
				<div class="route-results-title">
					<span>{busy ? 'Finding your route…' : 'Recommended routes'}</span><button
						class="icon-button mobile-only"
						aria-label="Toggle route details"
						onclick={() => (collapsed = !collapsed)}><Icon name="chevron" size={17} /></button
					>
				</div>
				<div class="route-results-content">
					{#each ranked as result, i (result.road.key)}{@const road =
							result.road}{@const roadBlocked = result.blocked}{@const seconds =
							result.seconds}<button
							class="demo-route-card"
							class:chosen={active?.key === road.key}
							disabled={!editable}
							onclick={() => {
								selectedKey = road.key;
								progress = 0;
							}}
							><span class="route-card-icon"><Icon name="car" /></span><span class="route-card-main"
								><strong
									>{roadBlocked ? 'Blocked — ETA unavailable' : formatTravelTime(seconds)}
									<small>{(road.distanceMeters / 1000).toFixed(1)} km</small></strong
								><span
									>{!floodSimulation && assessment?.recommendedKey === road.key
										? 'Lower estimated rainfall exposure'
										: i === 0 && !roadBlocked
											? 'Recommended route'
											: 'Alternative route'}</span
								><small class:blocked-text={roadBlocked}
									>{roadBlocked
										? 'Blocked by simulated flood'
										: !conditions.floodSimulation
											? 'Flood conditions unconfirmed'
											: 'No blocking simulated flood'}</small
								></span
							><span class="route-radio"></span></button
						>{/each}
				</div>
				{#if !roads.length && !busy}<p class="quiet-text">
						Choose your starting point and destination.
					</p>{/if}
				<label class="travel-mode"
					>Travel mode
					<select
						aria-label="Travel mode"
						disabled={offlineDemo}
						value={travelMode}
						onchange={(event) => (requestedMode = event.currentTarget.value as 'gps' | 'demo')}
					>
						<option value="gps">Live GPS · actual travel</option>
						<option value="demo">Demo playback</option>
					</select></label
				>
				<button
					class="primary-button start-button"
					disabled={!mounted ||
						!ownRoad ||
						busy ||
						(!gpsTravel && (!editable || blocked || liveUnavailable))}
					onclick={startTrip}><Icon name="play" size={18} />Start travel</button
				>
				<p class="demo-footnote">
					{gpsTravel
						? 'Uses your device location · keep this page open'
						: `Simulated travel · ${playbackSpeed}× playback`}
				</p>
			</div>
		{:else}
			<div class="maneuver-card">
				<span class="maneuver-arrow"><Icon name={arrived ? 'pin' : 'arrow'} size={34} /></span>
				<div>
					<small
						>{arrived
							? 'JOURNEY COMPLETE'
							: gpsTravel && (offRoute || busy || gpsMessage)
								? 'GPS STATUS'
								: 'NEXT DIRECTION'}</small
					>
					<h1>
						{arrived
							? 'You have arrived'
							: gpsTravel && (gpsMessage || busy)
								? gpsMessage || 'Updating directions…'
								: nextStep?.instruction || 'Continue on your route'}
					</h1>
					<p>
						{arrived
							? destination.name
							: `${Math.max(0, Math.round((nextStep?.progressMeters || 0) - currentProgress))} m ahead`}
					</p>
				</div>
			</div>
		{/if}
		<footer class="simulation-footer">
			<span class="connection-dot" class:online={connected}></span>
			<span
				>{offlineDemo
					? 'Local offline demo'
					: connected
						? 'Shared conditions connected'
						: 'Connecting…'}</span
			>
			<button
				class="text-button"
				onclick={() => (drawerOpen = !drawerOpen)}
				disabled={!mounted}
				aria-expanded={drawerOpen}>Simulation controls</button
			>
		</footer>
	</aside>
	{#if travelStarted}<section class="trip-card" aria-label="Trip progress">
			<div>
				<strong
					>{arrived
						? 'Arrived'
						: gpsTravel && (offRoute || busy || !!gpsMessage || !gpsTimestamp)
							? 'Updating ETA…'
							: blocked
								? 'Blocked — ETA unavailable'
								: formatTravelTime(remainingSeconds)}</strong
				><span
					>{(remainingMeters / 1000).toFixed(1)} km remaining
					<span class="trip-separator">·</span>
					{status}</span
				><small
					>{((completedMeters + progress) / 1000).toFixed(2)} km traveled · {gpsTravel
						? `Live GPS · ±${Math.round(gpsAccuracy)} m`
						: `${playbackSpeed}× playback`}</small
				>
			</div>
			<div class="trip-actions">
				<button
					class="icon-button"
					aria-label={muted ? 'Unmute voice' : 'Mute voice'}
					aria-pressed={muted}
					onclick={() => {
						muted = !muted;
						speechService.setMuted(muted);
					}}><Icon name="sound" /></button
				><button
					class="primary-button"
					disabled={arrived || (!gpsTravel && (!editable || blocked || busy || liveUnavailable))}
					onclick={() => {
						playing = !playing;
						candidates = [];
						rerouteGeneration++;
						rerouting = false;
					}}
					><Icon name={playing ? 'pause' : 'play'} size={17} />{playing
						? 'Pause'
						: 'Resume'}</button
				><button class="icon-button" aria-label="End trip" onclick={stopTrip}
					><Icon name="close" /></button
				>
			</div>
		</section>{/if}
	<aside class="controller-drawer" hidden={!drawerOpen} aria-label="Scenario configuration">
		<div class="configuration-close">
			<button class="text-button" onclick={() => (drawerOpen = false)}
				>Close configuration <Icon name="close" size={16} /></button
			>
		</div>
		<div class="playback-control">
			<label for="playback-speed">Travel playback speed</label>
			<select id="playback-speed" bind:value={playbackSpeed}>
				{#each [0.5, 1, 2, 5, 10, 20] as speed}
					<option value={speed}>{speed}×{speed === 1 ? ' · Real time' : ''}</option>
				{/each}
			</select>
			<p>Demo playback only · live GPS follows your actual movement.</p>
		</div>

		{#if currentSimulation}{#key offlineDemo}<ConditionsEditor
					simulation={currentSimulation}
					localOnly={offlineDemo}
					{picked}
					{selectedZone}
					onpick={(kind) => {
						picking = kind;
						if (window.innerWidth < 760) drawerOpen = false;
					}}
					oncancelpick={() => (picking = null)}
					onapply={apply}
					onpreview={(zones) => (previewZones = zones)}
				/>{/key}{:else}<p>Loading shared conditions…</p>{/if}
		<p class="controller-disclaimer">
			{offlineDemo
				? 'Local changes stay on this device and are never uploaded.'
				: 'No login required · Applied changes affect everyone.'}<br />Travel progress belongs to
			this browser only.
		</p>
		<button class="text-button" disabled={!editable} onclick={loadExampleTrip}
			>Load example trip: Fuente → SM City</button
		>
	</aside>
	<div class="demo-alerts" aria-live="polite">
		{#if offlineDemo}<div class="info-banner">
				<span>Offline route diagram · map tiles and live data need internet.</span
				>{#if online}<button onclick={exitOfflineDemo}>Return to shared live mode</button>{/if}
			</div>{/if}

		{#if picking}<div class="pick-banner">
				<Icon name="pin" /><span
					>Click the map to place {picking === 'origin'
						? 'your starting point'
						: picking === 'destination'
							? 'your destination'
							: `a ${picking} area`}</span
				><button onclick={() => (picking = null)}>Cancel</button>
			</div>{/if}
		{#if !connected && shared && !offlineDemo}<div class="info-banner">
				Shared conditions disconnected. {gpsTravel
					? 'GPS travel remains available.'
					: 'Travel paused.'}
				<button onclick={() => void syncConditions()}>Retry synchronization</button>
			</div>{/if}
		{#if !trafficSimulation && ownRoad?.source === 'osrm'}<div class="info-banner">
				Live traffic unavailable · using basic road directions and estimated ETA.
			</div>{/if}
		{#if started && gpsTravel && gpsMessage}<div class="info-banner" role="status">
				{gpsMessage}
			</div>{/if}

		{#if syncError && !offlineDemo}<div class="error-banner" role="alert">
				{syncError}<button onclick={() => void syncConditions()}>Retry synchronization</button>
			</div>{/if}
		{#if blocked}<div class="warning-banner">
				<Icon name="rain" />
				<div>
					<strong>{gpsTravel ? 'Simulated flood ahead' : 'Flood ahead. Travel paused.'}</strong>
					<p>A simulated flood blocks the remaining route.</p>
					<button disabled={rerouting || !editable} onclick={findAlternative}
						>{rerouting ? 'Checking roads…' : 'Find alternative from here'}</button
					>
				</div>
			</div>{/if}
		{#if alternative && alternativeEvaluation}<div class="info-banner alternative-banner">
				<span
					>{blocked ? 'Passable alternative' : 'Faster alternative'} · {formatTravelTime(
						alternativeEvaluation.seconds
					)}
					{#if !blocked}
						· Save {formatTravelTime(remainingSeconds - alternativeEvaluation.seconds)}{/if}</span
				>
				<button disabled={!editable || rerouting} onclick={() => acceptAlternative(alternative)}
					>Use alternative</button
				>
			</div>{/if}
		{#if error || routeError || rainfallError || staleTraffic || staleRainfall}<div
				class="error-banner"
				role="alert"
			>
				{error ||
					routeError ||
					rainfallError ||
					(staleRainfall
						? 'Rainfall assessment is stale. Refresh for updated conditions.'
						: 'Live traffic estimate is stale. Refresh for updated timing.')}{#if !error}<button
						onclick={() => {
							routeRequest++;
							weatherRequest++;
						}}>Retry</button
					>{/if}
			</div>{/if}
		{#if notice}<div class="info-banner">
				<span>{notice}</span><button
					class="icon-button"
					aria-label="Dismiss notice"
					onclick={() => (notice = '')}><Icon name="close" size={16} /></button
				>
			</div>{/if}
	</div>
	{#if !conditions.trafficSimulation || !conditions.floodSimulation}<div class="provider-status">
			{!conditions.trafficSimulation
				? trafficStatus || 'Loading live traffic…'
				: ''}{!conditions.floodSimulation
				? ` · ${assessment ? `Rainfall assessed ${new Date(assessment.assessedAt).toLocaleTimeString()}` : 'Loading rainfall assessment…'}`
				: ''}
		</div>{/if}
</main>
