<script lang="ts">
	import { pwaState } from '$lib/services/pwaState.svelte';
	import { validateConditions } from '$lib/services/simulationValidation';
	import { scenarioConditions } from '$lib/data/demoScenarios';
	import { matchGpsToRoute, usableGpsFix } from '$lib/services/gpsNavigation';
	import { haversineDistanceKm } from '$lib/services/trafficService';
	import { VEHICLE_TRAVEL_PROFILES } from '$lib/services/demoSimulation';
	import { onMount, tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import DemoMap from './DemoMap.svelte';
	import RouteChoices from './RouteChoices.svelte';
	import ConditionsSummary from './ConditionsSummary.svelte';
	import { CEBU_BOUNDS, type Bounds, type ObservedFloods } from '$lib/types/observedFlood';
	import { actionableObservedFloods, recentObservedFloods, intersectsObservedFlood } from '$lib/services/observedFlood';
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
		fetchFloodDetours,
		positionAt,
		type RoadRoute
	} from '$lib/services/routingService';
	import {
		advanceTimed,
		floodZones,
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
		muted = $state(false);
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
		clock = $state(Date.now());
	let mobile = $state(false);
	let wide = $state(false);
	let theme = $state<'dark'|'light'|'system'>('dark');
	let systemDark = $state(false);
	const resolvedTheme = $derived(theme === 'system' ? (systemDark ? 'dark' : 'light') : theme);
	function changeTheme(value: string) {
		if(value !== 'dark' && value !== 'light' && value !== 'system') return;
		theme=value;
		try { localStorage.setItem('floodnav-theme',value); } catch { /* Local preference is optional. */ }
	}
	let observed = $state<ObservedFloods|null>(null);
	let observedLoading = $state(true);
	let observedBounds = $state<Bounds>(CEBU_BOUNDS);
	let observedRequest = $state(0);
	$effect(()=> {
		const bounds=observedBounds, request=observedRequest;
		if(!mounted||!online||offlineDemo) {observedLoading=false;return;}
		const controller=new AbortController();
		const timer=setTimeout(async()=> {
			observedLoading=true;
			try {
				const response=await fetch('/api/observed-floods',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bounds}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(190000)])});
				if(!response.ok) throw new Error('Satellite data unavailable');
				const data:ObservedFloods=await response.json();
				if(!controller.signal.aborted) observed=data;
			} catch { if(!controller.signal.aborted) observed=observed?{...observed,stale:true}:null; }
			finally { if(!controller.signal.aborted) observedLoading=false; }
		},400);
		return ()=> {clearTimeout(timer);controller.abort();};
	});
	function updateObservedBounds(bounds:Bounds) {
		// All requests share the bounded Metro Cebu server cache. Avoid refetching on tiny pans.
		const inCebu=(b:Bounds)=>b[2]>=CEBU_BOUNDS[0]&&b[0]<=CEBU_BOUNDS[2]&&b[3]>=CEBU_BOUNDS[1]&&b[1]<=CEBU_BOUNDS[3];
		if(inCebu(bounds)!==inCebu(observedBounds)) observedBounds=bounds;
	}

	let mobileViewportHeight = $state(0);
	let mobilePanel = $state<'controls' | 'notifications' | 'configuration' | null>(null);
	let desktopDrawerOpen = $state(false);
	const drawerOpen = $derived(mobile ? mobilePanel === 'configuration' : desktopDrawerOpen);
	let panelTrigger: HTMLElement | null = null;
	async function setMobilePanel(panel: typeof mobilePanel, restoreFocus = false) {
		if (!mobile && panel === 'controls') return;
		if (panel === 'notifications') desktopDrawerOpen=false;
		if (panel && panel !== mobilePanel) panelTrigger = document.activeElement as HTMLElement;
		mobilePanel = panel;
		await tick();
		if (restoreFocus) {
			const target = panelTrigger?.getClientRects().length
				? panelTrigger
				: document.querySelector<HTMLElement>('.mobile-sheet-summary, .notification-toggle');
			target?.focus();
		} else if (panel === 'notifications')
			document.getElementById('mobile-notification-title')?.focus();
		else if (panel === 'configuration')
			document.querySelector<HTMLButtonElement>('.configuration-close button')?.focus();
	}
	function setConfiguration(open: boolean) {
		if (mobile) void setMobilePanel(open ? 'configuration' : null, !open);
		else {desktopDrawerOpen = open; if(open) mobilePanel=null;}
	}
	function beginPick(kind: NonNullable<typeof picking>) {
		picking = kind;
		void setMobilePanel(null);
	}
	let rerouteAbort: AbortController | null = null;
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
	const observedPath = $derived(ownRoad ? remainingPath(ownRoad.polyline, progress) : []);
	const observedEncounters = $derived(recentObservedFloods(online&&!offlineDemo?observed:null,clock).filter((f)=>intersectsObservedFlood(observedPath,f.geometry)));
	const observedAvoidance = $derived(actionableObservedFloods(observed,clock));
	const canAvoidObserved = $derived(!offlineDemo && online && observedAvoidance.some((f)=>intersectsObservedFlood(observedPath,f.geometry)));
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
							r.road.key !== ownRoad?.key &&
							!r.blocked &&
							JSON.stringify(r.road.polyline) !== JSON.stringify(ownRoad?.polyline)
					)?.road
				: null) ||
			null
	);
	const alternativeEvaluation = $derived(
		alternative
			? evaluateSimulation(alternative, conditions, vehicle.maxSafeWaterDepthCm, 0, vehicle.id)
			: null
	);

	const mainError = $derived(
		error ||
			routeError ||
			rainfallError ||
			(staleRainfall
				? 'Rainfall assessment is stale. Refresh for updated conditions.'
				: staleTraffic
					? 'Live traffic estimate is stale. Refresh for updated timing.'
					: '')
	);
	const providerMessage = $derived(
		[
			!trafficSimulation ? trafficStatus || 'Loading live traffic…' : '',
			!floodSimulation
				? assessment
					? `Rainfall assessed ${new Date(assessment.assessedAt).toLocaleTimeString()}`
					: 'Loading rainfall assessment…'
				: ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	const notificationCount = $derived(
		[
			offlineDemo,
			!connected && shared && !offlineDemo,
			!trafficSimulation && ownRoad?.source === 'osrm',
			started && gpsTravel && gpsMessage,
			syncError && !offlineDemo,
			blocked,
			alternative && alternativeEvaluation,
			mainError,
			notice,
			providerMessage,
			observedEncounters.length > 0,
			observed?.stale || observed?.status === 'unavailable'
		].filter(Boolean).length
	);
	const urgentMessage = $derived(
		blocked
			? 'Simulated flood · route blocked'
			: routeError
				? 'Route unavailable'
				: started && gpsTravel && gpsMessage
					? gpsMessage
					: started && !gpsTravel && liveUnavailable
						? 'Travel paused · check conditions'
						: ''
	);
	onMount(() => {
		const query = window.matchMedia('(max-width: 759px)');
		const desktopQuery=window.matchMedia('(min-width: 1100px)'), colorQuery=window.matchMedia('(prefers-color-scheme: dark)');
		const updateDesktop=()=>wide=desktopQuery.matches, updateColor=()=>systemDark=colorQuery.matches;
		updateDesktop();updateColor();
		desktopQuery.addEventListener('change',updateDesktop);colorQuery.addEventListener('change',updateColor);
		try { const saved=localStorage.getItem('floodnav-theme'); if(saved==='dark'||saved==='light'||saved==='system') theme=saved; } catch { /* Keep default. */ }
		const refreshObserved=()=> {if(!document.hidden) observedRequest++;};
		const observedTimer=setInterval(refreshObserved,15*60000);
		document.addEventListener('visibilitychange',refreshObserved);
		const viewport = window.visualViewport;
		const resizeViewport = () => {
			mobileViewportHeight = viewport?.height || window.innerHeight;
		};
		resizeViewport();
		viewport?.addEventListener('resize', resizeViewport);
		window.addEventListener('resize', resizeViewport);
		const update = () => {
			mobile = query.matches;
			mobilePanel = null;
		};
		update();
		query.addEventListener('change', update);
		const outside = (event: PointerEvent) => {
			if (
				mobilePanel === 'notifications' &&
				event.target instanceof Element &&
				!event.target.closest('.demo-alerts, .notification-toggle, .mobile-urgent')
			)
				void setMobilePanel(null);
		};
		document.addEventListener('pointerdown', outside);
		return () => {
			query.removeEventListener('change', update);
			desktopQuery.removeEventListener('change',updateDesktop);colorQuery.removeEventListener('change',updateColor);
			clearInterval(observedTimer);document.removeEventListener('visibilitychange',refreshObserved);
			viewport?.removeEventListener('resize', resizeViewport);
			window.removeEventListener('resize', resizeViewport);
			document.removeEventListener('pointerdown', outside);
		};
	});

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
		void setMobilePanel(null);
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
			setConfiguration(true);
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
			rerouteAbort?.abort();
			candidates = [];
			rerouteGeneration++;
			rerouting = false;
			if (!gpsTravel && ownRoad && !arrived && (blocked || (evaluation?.delaySeconds || 0) > 0))
				void findAlternative(true);
		});
	});
	async function findAlternative(fasterOnly = false) {
		rerouteAbort?.abort();
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
		rerouteAbort = abort;
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
						(!fasterOnly || blocked || r.seconds < remainingSeconds)
				)
				.map((r) => r.road);
			if (!candidates.length && blocked && conditions.floodSimulation && !offlineDemo) {
				notice = 'Searching nearby roads around the simulated flooding…';
				const hazards = floodZones(conditions.zones).filter(
					(zone) => zone.depthCm > vehicle.maxSafeWaterDepthCm
				);
				const detours = await fetchFloodDetours(
					current,
					destination.coordinate,
					currentPath,
					hazards,
					abort.signal
				);
				if (version !== rerouteGeneration || disposed) return;
				candidates = rankSimulationRoutes(
					detours,
					conditions,
					vehicle.maxSafeWaterDepthCm,
					vehicle.id
				)
					.filter((route) => !route.blocked)
					.map((route) => route.road);
				notice = candidates.length
					? 'Found a road detour avoiding the blocking simulated flood zones. ETA uses basic road estimates.'
					: 'No passable detour found in the nearby roads checked. Try another start or destination, or review the simulated flood areas.';
			} else if (!candidates.length)
				notice = blocked
					? 'No passable alternative available among returned roads. Travel stays paused.'
					: fasterOnly
						? 'No faster alternative available among returned roads.'
						: 'No different passable route returned by the routing service.';
		} catch (e) {
			if (version === rerouteGeneration)
				notice = e instanceof Error ? e.message : 'Could not find an alternative.';
		} finally {
			clearTimeout(timer);
			if (rerouteAbort === abort) rerouteAbort = null;
			if (version === rerouteGeneration) rerouting = false;
		}
	}
	async function findObservedAlternative() {
		if(!ownRoad||!canAvoidObserved||rerouting) return;
		rerouteAbort?.abort();
		const abort=new AbortController(); rerouteAbort=abort;
		const version=++rerouteGeneration;
		const from:Coordinate=[...position];
		const polygons=observedAvoidance.flatMap((f)=>f.geometry.coordinates.map((polygon)=>({type:'MultiPolygon' as const,coordinates:[polygon]})));
		const hazards=floodSimulation?floodZones(conditions.zones).filter((z)=>z.depthCm>vehicle.maxSafeWaterDepthCm):[];
		rerouting=true; candidates=[];
		try {
			const routes=await fetchFloodDetours(from,destination.coordinate,observedPath,hazards,abort.signal,polygons);
			if(version!==rerouteGeneration||disposed) return;
			// A moving GPS origin makes the returned candidates obsolete.
			if(haversineDistanceKm(from,position)*1000>30) {notice='Your position changed. Search again from your current location.';return;}
			candidates=routes;
			notice=routes.length?'Alternative avoids the recent satellite flood polygons. Other road conditions remain unconfirmed.':'No alternative found in the nearby roads checked. This does not prove that no detour exists.';
		} catch(e) { if(version===rerouteGeneration) notice=e instanceof Error?e.message:'Alternative search unavailable.'; }
		finally {if(version===rerouteGeneration) rerouting=false; if(rerouteAbort===abort) rerouteAbort=null;}
	}
	function acceptAlternative(road: RoadRoute) {
		rerouteAbort?.abort();
		void setMobilePanel(null, true);
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
		setConfiguration(false);
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
		setConfiguration(false);
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

{#snippet routeChoices()}
	<RouteChoices entries={ranked} selected={active?.key||''} disabled={!editable} {busy} recommendedKey={assessment?.recommendedKey} {floodSimulation} onselect={(road)=>{selectedKey=road.key;progress=0;void setMobilePanel(null,true);}} />
{/snippet}
{#snippet conditionsSummary()}
	<ConditionsSummary {observed} loading={observedLoading} offline={!online||offlineDemo} {providerMessage} onretry={()=>observedRequest++}/>
{/snippet}

<svelte:head
	><title>Directions · FloodNav</title><meta
		name="description"
		content="Cebu directions with live GPS tracking and shared demo conditions."
	/></svelte:head
>
<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			picking = null;
			void setMobilePanel(null, true);
		}
	}}
/>
<main
	class="demo-shell"
	data-theme={resolvedTheme}
	style:--mobile-viewport-height={mobile && mobileViewportHeight
		? `${mobileViewportHeight}px`
		: undefined}
	class:configuration-open={drawerOpen}
	class:mobile-controls-open={mobilePanel === 'controls'}
	class:mobile-notifications-open={mobilePanel === 'notifications'}
	class:map-picking={!!picking}
>
	<header class="mobile-topbar">
		<a href="/" class="brand"><Icon name="route" />FloodNav</a>
		<div>
			<select class="theme-select" aria-label="Color theme" value={theme} onchange={(event)=>changeTheme(event.currentTarget.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select>
			<button
				class="icon-button"
				aria-label="Simulation controls"
				aria-expanded={drawerOpen}
				disabled={!mounted}
				onclick={() => setConfiguration(!drawerOpen)}><Icon name="settings" /></button
			>
			<button
				class="icon-button notification-toggle"
				disabled={!mounted}
				aria-label={`Notifications, ${notificationCount} active`}
				aria-expanded={mobilePanel === 'notifications'}
				aria-controls="mobile-notifications"
				onclick={() =>
					setMobilePanel(
						mobilePanel === 'notifications' ? null : 'notifications',
						mobilePanel === 'notifications'
					)}
			>
				<Icon name="bell" />{#if notificationCount}<span class="notification-count"
						>{notificationCount}</span
					>{/if}
			</button>
		</div>
	</header>
	{#if urgentMessage && !picking}<button
			class="mobile-urgent"
			aria-live="polite"
			onclick={() => setMobilePanel('notifications')}
			><Icon name="rain" size={18} /><span>{urgentMessage}</span><Icon
				name="chevron"
				size={16}
			/></button
		>{/if}
	{#if picking}<div class="pick-banner">
			<Icon name="pin" /><span
				>Click the map to place {picking === 'origin'
					? 'your starting point'
					: picking === 'destination'
						? 'your destination'
						: `a ${picking} area`}</span
			><button onclick={() => (picking = null)}>Cancel</button>
		</div>{/if}
	<div class="mobile-map-stage">
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
			{observed}
			onbounds={updateObservedBounds}
			onpick={mapPick}
			onzone={(id) => {
				selectedZone = id;
				setConfiguration(true);
			}}
			ontrafficstatus={(value) => (trafficStatus = value)}
		/>
	</div>
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
			<button
				class="mobile-sheet-summary"
				disabled={!mounted}
				aria-expanded={mobilePanel === 'controls'}
				aria-controls="mobile-planner"
				aria-label={mobilePanel === 'controls' ? 'Collapse trip controls' : 'Expand trip controls'}
				onclick={() => setMobilePanel(mobilePanel === 'controls' ? null : 'controls')}
			>
				<span
					><strong>{destination.name || 'Choose destination'}</strong><small
						>{VEHICLE_TRAVEL_PROFILES[vehicle.id].label} · {gpsTravel ? 'GPS' : 'Demo'} · {busy
							? 'Finding route…'
							: blocked
								? 'Blocked'
								: ownRoad
									? `${formatTravelTime(remainingSeconds)} · ${(ownRoad.distanceMeters / 1000).toFixed(1)} km`
									: 'Choose destination'}</small
					></span
				><Icon name="chevron" />
			</button>
			<div class="planner-body" id="mobile-planner">
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
							onpick={() => beginPick('origin')}
							ongps={locate}
						/><LocationPicker
							label="Destination"
							value={displayedDestination}
							disabled={!editable || offlineDemo}
							onchoose={(p) => changeWaypoint('destination', p)}
							onpick={() => beginPick('destination')}
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
			<div class="route-results">
				{#if !wide}{@render routeChoices()}{/if}
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
				{#if !wide}<div class="inline-conditions">{@render conditionsSummary()}</div>{/if}
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
		</footer>
	</aside>
	{#if wide}<aside class="insights-panel" aria-label="Route options and conditions">
		{#if !travelStarted}{@render routeChoices()}{:else}
			<h2>Remaining journey</h2><p>{(remainingMeters/1000).toFixed(1)} km · {formatTravelTime(remainingSeconds)}</p>
			{#each candidates as road}<button class="demo-route-card" onclick={()=>acceptAlternative(road)}>Use alternative · {(road.distanceMeters/1000).toFixed(1)} km</button>{/each}
		{/if}
		{@render conditionsSummary()}
	</aside>{/if}
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
			<button class="text-button" onclick={() => setConfiguration(false)}
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
						beginPick(kind);
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
	<div
		class="demo-alerts"
		id="mobile-notifications"
		aria-label="Notifications"
		aria-live={mobile ? 'off' : 'polite'}
	>
		<div class="mobile-notification-heading">
			<div>
				<h2 id="mobile-notification-title" tabindex="-1">Notifications</h2>
				<small
					>{trafficSimulation ? 'Simulated traffic' : 'Live traffic'} · {floodSimulation
						? 'Simulated flooding'
						: 'Live rainfall'}<br />{offlineDemo
						? 'Local offline demo'
						: connected
							? 'Shared conditions connected'
							: 'Shared conditions disconnected'}</small
				>
			</div>
			<button
				class="icon-button"
				aria-label="Close notifications"
				onclick={() => setMobilePanel(null, true)}><Icon name="close" /></button
			>
		</div>
		{#if notificationCount === 0}<p class="mobile-notification-empty">
				No active notifications
			</p>{/if}
		{#if syncError && !offlineDemo}<div class="error-banner" role="alert">
				{syncError}<button onclick={() => void syncConditions()}>Retry synchronization</button>
			</div>{/if}
		{#if mainError}<div class="error-banner" role="alert">
				{mainError}{#if !error}<button
						onclick={() => {
							routeRequest++;
							weatherRequest++;
						}}>Retry</button
					>{/if}
			</div>{/if}
		{#if observed?.stale || observed?.status === 'unavailable'}<div class="error-banner">Satellite provider unavailable. {observed?.fetchedAt?'Showing dated cached observations.':'Flood conditions remain unknown.'}<button disabled={observedLoading||!online||offlineDemo} onclick={()=>observedRequest++}>Retry satellite data</button></div>{/if}
		{#if observedEncounters.length}<div class="warning-banner"><Icon name="rain"/><div><strong>Satellite-observed flooding intersects this route</strong><p>Recent observation, not a confirmed road closure. Check local conditions.</p>{#if canAvoidObserved}<button disabled={rerouting} onclick={findObservedAlternative}>{rerouting?'Checking roads…':'Find alternative around observed flooding'}</button>{/if}</div></div>{/if}
		{#if blocked}<div class="warning-banner">
				<Icon name="rain" />
				<div>
					<strong>{gpsTravel ? 'Simulated flood ahead' : 'Flood ahead. Travel paused.'}</strong>
					<p>A simulated flood blocks the remaining route.</p>
					<button disabled={rerouting || !editable} onclick={() => findAlternative()}
						>{rerouting ? 'Checking roads…' : 'Find alternative from here'}</button
					>
				</div>
			</div>{/if}
		{#if offlineDemo}<div class="info-banner">
				<span>Offline route diagram · map tiles and live data need internet.</span
				>{#if online}<button onclick={exitOfflineDemo}>Return to shared live mode</button>{/if}
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

		{#if alternative && alternativeEvaluation}<div class="info-banner alternative-banner">
				<span
					>{blocked
						? 'Passable alternative'
						: alternativeEvaluation.seconds < remainingSeconds
							? 'Faster alternative'
							: 'Alternative route'} · {formatTravelTime(alternativeEvaluation.seconds)}
					{#if !blocked && alternativeEvaluation.seconds < remainingSeconds}
						· Save {formatTravelTime(remainingSeconds - alternativeEvaluation.seconds)}{/if}</span
				>
				<button disabled={!editable || rerouting} onclick={() => acceptAlternative(alternative)}
					>Use alternative</button
				>
			</div>{/if}
		{#if notice}<div class="info-banner">
				<span>{notice}</span><button
					class="icon-button"
					aria-label="Dismiss notice"
					onclick={() => (notice = '')}><Icon name="close" size={16} /></button
				>
			</div>{/if}
		{#if providerMessage}<div class="info-banner mobile-provider-status">
				{providerMessage}
			</div>{/if}
	</div>
	{#if !conditions.trafficSimulation || !conditions.floodSimulation}<div
			class="provider-status desktop-provider-status"
		>
			{!conditions.trafficSimulation
				? trafficStatus || 'Loading live traffic…'
				: ''}{!conditions.floodSimulation
				? ` · ${assessment ? `Rainfall assessed ${new Date(assessment.assessedAt).toLocaleTimeString()}` : 'Loading rainfall assessment…'}`
				: ''}
		</div>{/if}
</main>
