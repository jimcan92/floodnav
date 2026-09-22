<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import DemoMap from './DemoMap.svelte';
	import LocationPicker from './LocationPicker.svelte';
	import ConditionsEditor from './ConditionsEditor.svelte';
	import type { Conditions, DemoRoom, SimulationZone, Telemetry, Waypoint } from '$lib/types/demo';
	import type { Coordinate, DemoScenario } from '$lib/types/navigation';
	import type { ExposureAssessment } from '$lib/types/rainfall';
	import { DEFAULT_VEHICLE_CATEGORY, VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
	import { DEMO_ORIGIN, DEMO_DESTINATION, DEMO_ROADS } from '$lib/data/demoScenarios';
	import {
		cumulativeDistances,
		fetchRoadRoutes,
		intersectsFlood,
		positionAt,
		type RoadRoute
	} from '$lib/services/routingService';
	import {
		advanceTimed,
		floodZones,
		remainingPath,
		secondsRemaining,
		timedSegments
	} from '$lib/services/demoSimulation';
	import { speechService } from '$lib/services/speechService';
	import { sampleRate } from '$lib/services/rainfallAssessment';
	import { demoId } from '$lib/services/demoId';
	import './demo.css';

	let { roomId = '', controller = false }: { roomId?: string; controller?: boolean } = $props();
	const initialOrigin = (): Waypoint => ({
		name: 'Fuente Osmeña Circle',
		coordinate: [...DEMO_ORIGIN]
	});
	const initialDestination = (): Waypoint => ({
		name: 'SM City Cebu',
		coordinate: [...DEMO_DESTINATION]
	});
	let mounted = $state(false),
		room = $state<DemoRoom | null>(null),
		connected = $state(false),
		travelerId = $state('');
	let origin = $state(initialOrigin()),
		destination = $state(initialDestination()),
		vehicleId = $state(DEFAULT_VEHICLE_CATEGORY.id);
	let roads = $state<RoadRoute[]>([]),
		selectedKey = $state(''),
		progress = $state(0),
		completedMeters = $state(0);
	let playing = $state(false),
		started = $state(false),
		busy = $state(false),
		creating = $state(false),
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
		drawerOpen = $state(true),
		clock = $state(Date.now());
	let lastReset = -1,
		sourceIdentity = '',
		routeGeneration = 0,
		rerouteGeneration = 0,
		eventSource: EventSource | null = null,
		telemetryBusy = false,
		lastTelemetry = '',
		lastSpeech = '',
		skipHydrated = false,
		lastSnapshot = 0;
	const conditions = $derived(
		room?.conditions || { trafficSimulation: true, floodSimulation: true, zones: [] }
	);
	const trafficSimulation = $derived(conditions.trafficSimulation);
	const floodSimulation = $derived(conditions.floodSimulation);
	const roomReady = $derived(!roomId || !!room);
	const owner = $derived(!roomId || (!!room && room.travelerId === travelerId));
	const editable = $derived(mounted && !controller && owner && (!roomId || connected));
	const vehicle = $derived(
		VEHICLE_CATEGORIES.find((v) => v.id === vehicleId) || DEFAULT_VEHICLE_CATEGORY
	);
	const ownRoad = $derived(roads.find((r) => r.key === selectedKey) || roads[0] || null);
	const observed = $derived(controller || !owner);
	const active = $derived(observed ? room?.telemetry?.route || null : ownRoad);
	const currentProgress = $derived(observed ? room?.telemetry?.progress || 0 : progress);
	const displayedOrigin = $derived(observed ? room?.telemetry?.origin || origin : origin);
	const displayedDestination = $derived(
		observed ? room?.telemetry?.destination || destination : destination
	);
	const position = $derived(
		observed
			? room?.telemetry?.position || displayedOrigin.coordinate
			: ownRoad
				? positionAt(ownRoad.polyline, progress)
				: origin.coordinate
	);
	const visibleZones = $derived(
		(controller && previewZones ? previewZones : conditions.zones).filter((z) =>
			z.kind === 'traffic' ? conditions.trafficSimulation : conditions.floodSimulation
		)
	);
	const floods = $derived(conditions.floodSimulation ? floodZones(conditions.zones) : []);
	const timing = $derived(
		ownRoad ? timedSegments(ownRoad, conditions.trafficSimulation ? conditions.zones : []) : []
	);
	const total = $derived(ownRoad ? cumulativeDistances(ownRoad.polyline).at(-1) || 0 : 0);
	const remainingSeconds = $derived(
		observed ? room?.telemetry?.remainingSeconds || 0 : secondsRemaining(timing, progress)
	);
	const blocked = $derived(
		!!ownRoad &&
			floods.some(
				(z) =>
					z.depthCm > vehicle.maxSafeWaterDepthCm &&
					intersectsFlood(remainingPath(ownRoad.polyline, progress), z)
			)
	);
	const arrived = $derived(total > 0 && progress >= total);
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
		observed
			? room?.telemetry?.status || 'idle'
			: arrived
				? 'arrived'
				: blocked
					? 'blocked'
					: playing
						? 'running'
						: started
							? 'paused'
							: 'idle'
	);
	const travelStarted = $derived(observed ? status !== 'idle' : started);
	const remainingMeters = $derived(
		active ? Math.max(0, (cumulativeDistances(active.polyline).at(-1) || 0) - currentProgress) : 0
	);
	const alternative = $derived(
		candidates[0] ||
			roads.find(
				(r) => r.key !== ownRoad?.key && !floods.some((z) => intersectsFlood(r.polyline, z))
			) ||
			null
	);
	const dataStatus = $derived({
		traffic: conditions.trafficSimulation ? 'Traffic simulation' : routeError || (staleTraffic ? 'Traffic estimate stale' : trafficStatus || 'Loading live traffic…'),
		rainfall: conditions.floodSimulation ? 'Flood simulation' : rainfallError || (staleRainfall ? 'Rainfall assessment stale' : assessment ? `Rainfall assessed ${new Date(assessment.assessedAt).toLocaleTimeString()}` : 'Loading rainfall assessment…')
	});

	async function api(path: string, method = 'GET', payload?: unknown) {
		const response = await fetch(path, {
			method,
			headers: payload ? { 'Content-Type': 'application/json' } : {},
			body: payload ? JSON.stringify(payload) : undefined,
			signal: AbortSignal.timeout(20000)
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Request failed.');
		return data;
	}
	function restore(t: Telemetry | null) {
		playing = false;
		if (!t) return;
		origin = t.origin;
		destination = t.destination;
		vehicleId = t.vehicleId as typeof vehicleId;
		roads = t.route ? [t.route] : [];
		selectedKey = t.route?.key || '';
		progress = t.progress;
		completedMeters = t.completedMeters;
		started = t.status !== 'idle';
		routingStart = t.route?.polyline[0] || null;
		fixture = t.route?.source === 'fixture';
		skipHydrated = !!t.route;
	}
	function receive(next: DemoRoom) {
		if (room && next.sequence < room.sequence) return;
		const wasOwner = room?.travelerId === travelerId,
			reset = next.resetVersion !== lastReset,
			applyPreset = lastReset >= 0 || !next.telemetry;
		const previousConditions = room?.conditions;
		room = next;
		if (!controller && next.travelerId === travelerId && !wasOwner) restore(next.telemetry);
		if (reset) {
			lastReset = next.resetVersion;
			if (next.preset && applyPreset) {
				playing = false;
				started = false;
				origin = initialOrigin();
				destination = initialDestination();
				progress = 0;
				completedMeters = 0;
				routingStart = null;
				fixture = true;
				skipHydrated = false;
				roads = DEMO_ROADS;
				selectedKey = DEMO_ROADS[0].key;
				candidates = [];
			}
		}
		const identity = `${next.conditions.trafficSimulation}:${next.conditions.floodSimulation}`;
		if (
			sourceIdentity &&
			identity !== sourceIdentity &&
			!(reset && next.preset) &&
			!controller &&
			next.travelerId === travelerId
		) {
			playing = false;
			rebaseAtCurrentPosition();
			fixture = false;
			routeRequest++;
			notice = 'Data source changed. Review the remaining route, then resume.';
		}
		if (
			previousConditions &&
			JSON.stringify(previousConditions) !== JSON.stringify(next.conditions)
		) {
			candidates = [];
			rerouteGeneration++;
		}
		sourceIdentity = identity;
	}
	function rebaseAtCurrentPosition() {
		const road = ownRoad,
			moved = progress;
		routingStart = road ? positionAt(road.polyline, moved) : origin.coordinate;
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
	function connectEvents() {
		if (!roomId) return;
		eventSource?.close();
		eventSource = new EventSource(`/api/demo/rooms/${roomId}/events`);
		eventSource.onmessage = (e) => {
			if (!navigator.onLine) return;
			receive(JSON.parse(e.data));
			connected = true;
			lastSnapshot = Date.now();
		};
		eventSource.onerror = () => {
			connected = false;
			playing = false;
		};
	}
	async function claim(takeover = false) {
		try {
			receive(await api(`/api/demo/rooms/${roomId}/claim`, 'POST', { travelerId, takeover }));
		} catch (e) {
			notice = e instanceof Error ? e.message : 'Unable to take control.';
		}
	}
	async function createRoom() {
		creating = true;
		error = '';
		try {
			const created: DemoRoom = await api('/api/demo/rooms', 'POST');
			await api(`/api/demo/rooms/${created.id}/claim`, 'POST', { travelerId });
			await api(`/api/demo/rooms/${created.id}/telemetry`, 'POST', {
				travelerId,
				resetVersion: 0,
				telemetry: snapshot()
			});
			await goto(`/demo/${created.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not create room.';
		} finally {
			creating = false;
		}
	}
	function snapshot(): Telemetry {
		return {
			origin,
			destination,
			position,
			route: ownRoad,
			progress,
			completedMeters,
			remainingSeconds,
			status: status as Telemetry['status'],
			vehicleId,
			dataStatus
		};
	}
	async function publishTelemetry() {
		if (!roomId || controller || !owner || !connected || telemetryBusy || !room) return;
		const telemetry = snapshot(),
			serialized = JSON.stringify(telemetry);
		if (serialized === lastTelemetry) return;
		telemetryBusy = true;
		try {
			const next = await api(`/api/demo/rooms/${roomId}/telemetry`, 'POST', {
				travelerId,
				resetVersion: room.resetVersion,
				telemetry
			});
			receive(next);
			lastTelemetry = serialized;
		} catch {
			playing = false;
			notice = 'Traveler synchronization interrupted. Waiting for the latest room state.';
		} finally {
			telemetryBusy = false;
		}
	}
	onMount(() => {
		// One identity per tab; duplicated tabs deliberately receive a new identity.
		const tab = window as Window & { floodnavTravelerId?: string };
		travelerId = tab.floodnavTravelerId ??= demoId();
		mounted = true;
		if (roomId) {
			void api(`/api/demo/rooms/${roomId}`)
				.then(async (next) => {
					receive(next);
					if (!controller && !next.travelerId) await claim();
				})
				.catch((e) => (error = e.message));
			connectEvents();
		} else connected = true;
		const ticker = setInterval(() => {
			clock = Date.now();
			if (roomId && connected && lastSnapshot && clock - lastSnapshot > 25000) {
				connected = false;
				playing = false;
				connectEvents();
			}
			if (playing && editable && !busy && !blocked && !liveUnavailable && !document.hidden)
				progress = advanceTimed(timing, progress, 5);
			if (arrived) playing = false;
		}, 250);
		const telemetryTimer = setInterval(() => {
			void publishTelemetry();
		}, 1000);
		const refreshTimer = setInterval(() => {
			if (document.hidden || controller || !owner) return;
			if (!conditions.trafficSimulation && !playing) {
				if (started && ownRoad && !arrived) rebaseAtCurrentPosition();
				routeRequest++;
			}
			if (!conditions.floodSimulation) weatherRequest++;
		}, 120000);
		const hide = () => {
			if (document.hidden) playing = false;
		};
		document.addEventListener('visibilitychange', hide);
		const offline = () => {
			if (roomId) {
				connected = false;
				playing = false;
				eventSource?.close();
			}
		};
		window.addEventListener('offline', offline);
		window.addEventListener('online', connectEvents);
		return () => {
			eventSource?.close();
			clearInterval(ticker);
			clearInterval(telemetryTimer);
			clearInterval(refreshTimer);
			document.removeEventListener('visibilitychange', hide);
			window.removeEventListener('offline', offline);
			window.removeEventListener('online', connectEvents);
			speechService.cancel();
		};
	});
	async function getRoutes(
		start: Coordinate,
		end: Coordinate,
		simulated: boolean,
		signal: AbortSignal
	) {
		if (simulated) return fetchRoadRoutes(start, end, signal);
		const response = await fetch('/api/demo/routes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ origin: start, destination: end }),
			signal
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		return data as RoadRoute[];
	}
	$effect(() => {
		if (!mounted || controller || !owner || !roomReady) return;
		const start = routingStart || origin.coordinate,
			end = destination.coordinate,
			simulated = trafficSimulation,
			useFixture = fixture;
		void routeRequest;
		if (skipHydrated) {
			skipHydrated = false;
			return;
		}
		// Hydrated telemetry already contains a route. Only endpoint/provider/request changes fetch again.
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
						? 'Routing timed out. Retry or load a demo preset from the controller.'
						: e.message;
			})
			.finally(() => {
				clearTimeout(timer);
				if (!disposed) busy = false;
			});
		return () => {
			disposed = true;
			abort.abort();
			clearTimeout(timer);
		};
	});
	$effect(() => {
		const simulated = floodSimulation;
		if (!mounted || controller || !owner || simulated || !roads.length) {
			assessment = null;
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
							'Live rainfall assessment incomplete. Retry or enable flood simulation.';
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
		if (blocked || !editable || liveUnavailable) playing = false;
	});
	$effect(() => {
		if (!playing || muted || !nextStep) return;
		const key = `${active?.key}:${nextStep.id}`;
		if (lastSpeech !== key) {
			lastSpeech = key;
			untrack(() => speechService.speak(nextStep.instruction));
		}
	});
	$effect(() => {
		if (blocked && mounted && !muted && owner && !controller)
			untrack(() =>
				speechService.speak('Simulated flood ahead. Travel paused. Check an alternative route.')
			);
	});
	function changeWaypoint(which: 'origin' | 'destination', value: Waypoint) {
		if (!editable) return;
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
				notice = 'Origin updated. Travel remains simulated.';
			},
			() => (notice = 'Location denied or unavailable. Choose a preset or map point.'),
			{ timeout: 8000 }
		);
	}
	async function apply(conditions: Conditions, revision: number, preset?: DemoScenario) {
		try {
			receive(await api(`/api/demo/rooms/${roomId}`, 'PATCH', { conditions, revision, preset }));
			error = '';
			return true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not publish changes.';
			try {
				receive(await api(`/api/demo/rooms/${roomId}`));
			} catch {}
			return false;
		}
	}
	async function findAlternative() {
		if (!ownRoad || !editable) return;
		rerouting = true;
		notice = '';
		const version = ++rerouteGeneration;
		const current = positionAt(ownRoad.polyline, progress),
			currentRoad = ownRoad;
		const abort = new AbortController(),
			timer = setTimeout(() => abort.abort(), 18000);
		try {
			let result: RoadRoute[];
			if (fixture && progress === 0) result = DEMO_ROADS.filter((r) => r.key !== currentRoad.key);
			else
				result = await getRoutes(
					current,
					destination.coordinate,
					conditions.trafficSimulation,
					abort.signal
				);
			if (version !== rerouteGeneration) return;
			candidates = result.filter(
				(r) =>
					!floods.some((z) => intersectsFlood(r.polyline, z)) &&
					JSON.stringify(r.polyline) !==
						JSON.stringify(remainingPath(currentRoad.polyline, progress))
			);
			if (!candidates.length)
				notice =
					'No flood-avoiding alternative available among returned routes. Travel stays paused.';
		} catch (e) {
			notice = e instanceof Error ? e.message : 'Could not find an alternative.';
		} finally {
			clearTimeout(timer);
			rerouting = false;
		}
	}
	function acceptAlternative(road: RoadRoute) {
		playing = false;
		completedMeters += progress;
		progress = 0;
		roads = [road];
		selectedKey = road.key;
		candidates = [];
		notice = 'Alternative selected. Resume when ready.';
		lastSpeech = '';
	}
	async function copyController() {
		try {
			await navigator.clipboard.writeText(`${location.origin}/demo/${roomId}/controller`);
			notice = 'Controller link copied. Open it on the other device.';
		} catch {
			notice = `Controller: ${location.origin}/demo/${roomId}/controller`;
		}
	}
	function stopTrip() {
		playing = false;
		started = false;
		progress = 0;
		completedMeters = 0;
		routingStart = null;
		routeRequest++;
		lastSpeech = '';
	}
	function minutes(seconds: number) {
		return Math.max(1, Math.ceil(seconds / 60));
	}
</script>

<svelte:head
	><title>{controller ? 'Scenario Controller' : 'Directions'} · FloodNav</title><meta
		name="description"
		content="An interactive Cebu flood-aware travel demo."
	/></svelte:head
>
<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') picking = null;
	}}
/>
<main class="demo-shell" class:controller-view={controller}>
	<DemoMap
		origin={displayedOrigin.coordinate}
		destination={displayedDestination.coordinate}
		{position}
		route={active}
		{alternative}
		zones={visibleZones}
		picking={!!picking}
		liveTraffic={!conditions.trafficSimulation}
		{controller}
		{assessment}
		onpick={mapPick}
		onzone={(id) => (selectedZone = id)}
		ontrafficstatus={(value) => (trafficStatus = value)}
	/>
	<div class="map-source-badges">
		<span
			><i class:live={!conditions.trafficSimulation}></i>{conditions.trafficSimulation
				? 'Simulated traffic'
				: 'Live traffic'}</span
		><span
			><i class:live={!conditions.floodSimulation}></i>{conditions.floodSimulation
				? 'Simulated flooding'
				: 'Live rainfall'}</span
		>
	</div>
	{#if !controller}
		<aside class="directions-panel" class:traveling={travelStarted}>
			<header class="brand-header">
				<a href="/" class="brand"
					><span class="brand-mark"><Icon name="route" size={23} /></span>FloodNav<span
						class="brand-city">CEBU</span
					></a
				><span class="demo-label">TRAVEL DEMO</span>
			</header>
			{#if !travelStarted}
				<div class="planner-body">
					<div class="planner-title">
						<h1>Where to?</h1>
						<p>A clearer route through changing conditions.</p>
					</div>
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
								disabled={!editable}
								onchoose={(p) => changeWaypoint('origin', p)}
								onpick={() => (picking = 'origin')}
								ongps={locate}
							/><LocationPicker
								label="Destination"
								value={displayedDestination}
								disabled={!editable}
								onchoose={(p) => changeWaypoint('destination', p)}
								onpick={() => (picking = 'destination')}
							/>
						</div>
						<button
							class="swap-button icon-button"
							aria-label="Swap start and destination"
							disabled={!editable}
							onclick={() => {
								const a = origin,
									b = destination;
								changeWaypoint('origin', b);
								changeWaypoint('destination', a);
							}}><Icon name="route" size={19} /></button
						>
					</div>
					<label class="vehicle-field"
						><Icon name="car" size={19} /><select
							aria-label="Vehicle"
							bind:value={vehicleId}
							disabled={!editable}
							>{#each VEHICLE_CATEGORIES as v}<option value={v.id}>{v.title}</option>{/each}</select
						><span>Demo profile</span></label
					>
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
						{#each observed ? (active ? [active] : []) : roads as road, i (road.key)}{@const roadBlocked =
								floods.some(
									(z) =>
										z.depthCm > vehicle.maxSafeWaterDepthCm && intersectsFlood(road.polyline, z)
								)}{@const seconds = timedSegments(
								road,
								conditions.trafficSimulation ? conditions.zones : []
							).reduce((n, s) => n + s.seconds, 0)}<button
								class="demo-route-card"
								class:chosen={active?.key === road.key}
								disabled={!editable}
								onclick={() => {
									selectedKey = road.key;
									progress = 0;
								}}
								><span class="route-card-icon"><Icon name="car" /></span><span
									class="route-card-main"
									><strong
										>{minutes(seconds)} min
										<small>{(road.distanceMeters / 1000).toFixed(1)} km</small></strong
									><span>{!floodSimulation && assessment?.recommendedKey === road.key ? 'Lower estimated rainfall exposure' : i === 0 ? 'Recommended route' : 'Alternative route'}</span><small
										class:blocked-text={roadBlocked}
										>{roadBlocked
											? 'Blocked by simulated flood'
											: !conditions.floodSimulation
												? 'Flood conditions unconfirmed'
												: 'No blocking simulated flood'}</small
									></span
								><span class="route-radio"></span></button
							>{/each}
					</div>
					{#if !roads.length && !busy && !observed}<p class="quiet-text">
							Choose your starting point and destination.
						</p>{/if}
					{#if !roomId}<button
							class="primary-button start-button"
							disabled={creating || !mounted}
							onclick={createRoom}
							>{creating ? 'Creating demo…' : 'Create demo'}<Icon name="arrow" size={18} /></button
						>
						<p class="demo-footnote">Invite a controller. Experience a changing journey.</p>
					{:else}<button
							class="primary-button start-button"
							disabled={!editable || !ownRoad || busy || blocked || liveUnavailable}
							onclick={() => {
								started = true;
								playing = true;
							}}><Icon name="play" size={18} />Start demo</button
						>
						<p class="demo-footnote">Simulated travel · 20× playback</p>{/if}
				</div>
			{:else}
				<div class="maneuver-card">
					<span class="maneuver-arrow"><Icon name={arrived ? 'pin' : 'arrow'} size={34} /></span>
					<div>
						<small>{arrived ? 'JOURNEY COMPLETE' : 'NEXT DIRECTION'}</small>
						<h1>
							{arrived ? 'You have arrived' : nextStep?.instruction || 'Continue on your route'}
						</h1>
						<p>
							{arrived
								? destination.name
								: `${Math.max(0, Math.round((nextStep?.progressMeters || 0) - currentProgress))} m ahead`}
						</p>
					</div>
				</div>
			{/if}
			{#if roomId}<footer class="room-footer">
					<span class="connection-dot" class:online={connected}></span><span
						>{connected
							? owner
								? 'Traveler connected'
								: 'Watching traveler'
							: 'Reconnecting…'}</span
					><button
						class="icon-button"
						title="Copy controller link"
						aria-label="Copy controller link"
						onclick={copyController}><Icon name="link" size={17} /></button
					><a
						href={`/demo/${roomId}/controller`}
						target="_blank"
						rel="noreferrer"
						aria-label="Open controller"
						title="Open controller"><Icon name="settings" size={18} /></a
					>
				</footer>{/if}
		</aside>
		{#if travelStarted}<section class="trip-card" aria-label="Trip progress">
				<div>
					<strong>{arrived ? 'Arrived' : `${minutes(remainingSeconds)} min`}</strong><span
						>{(remainingMeters / 1000).toFixed(1)} km remaining
						<span class="trip-separator">·</span>
						{status}</span
					><small
						>{((completedMeters + progress) / 1000).toFixed(2)} km traveled · Simulated journey</small
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
						disabled={!editable || blocked || arrived || busy || liveUnavailable}
						onclick={() => (playing = !playing)}
						><Icon name={playing ? 'pause' : 'play'} size={17} />{playing
							? 'Pause'
							: 'Resume'}</button
					><button class="icon-button" aria-label="End trip" disabled={!editable} onclick={stopTrip}
						><Icon name="close" /></button
					>
				</div>
			</section>{/if}
	{:else}
		<header class="controller-topbar">
			<a class="brand" href={`/demo/${roomId}`}
				><span class="brand-mark"><Icon name="route" size={23} /></span>FloodNav</a
			><span class="controller-tag">Controller</span><button
				class="icon-button"
				aria-label="Toggle configuration"
				onclick={() => (drawerOpen = !drawerOpen)}><Icon name="settings" /></button
			>
		</header>
		<section class="traveler-monitor">
			<span class="eyebrow">TRAVELER VIEW</span>
			<h2>
				{room?.telemetry ? `${minutes(remainingSeconds)} min remaining` : 'Waiting for traveler'}
			</h2>
			<p>
				{room?.telemetry
					? `${displayedOrigin.name} → ${displayedDestination.name}`
					: 'Open the traveler link to begin your demo.'}
			</p>
			<div>
				<span class="monitor-status">{status}</span><span
					>{(remainingMeters / 1000).toFixed(1)} km remaining</span
				>
			</div>
			<a href={`/demo/${roomId}`} target="_blank" rel="noreferrer">Open traveler ↗</a>
		</section>
		<aside class="controller-drawer" hidden={!drawerOpen} aria-label="Scenario configuration">
			<div class="drawer-mobile-handle">
				<button class="text-button" onclick={() => (drawerOpen = false)}
					>Close configuration <Icon name="close" size={16} /></button
				>
			</div>
			{#if room}<ConditionsEditor
					{room}
					{picked}
					{selectedZone}
					onpick={(kind) => {
						picking = kind;
						if (window.innerWidth < 760) drawerOpen = false;
					}}
					oncancelpick={() => (picking = null)}
					onapply={apply}
					onpreview={(zones) => (previewZones = zones)}
				/>{:else}<p>Connecting to demo room…</p>{/if}
			<p class="controller-disclaimer">
				Demo controls · No login required<br />Changes are shared with this room. Restarting the
				server clears the demo.
			</p>
		</aside>
	{/if}
	<div class="demo-alerts" aria-live="polite">
		{#if picking}<div class="pick-banner">
				<Icon name="pin" /><span
					>Click the map to place {picking === 'origin'
						? 'your starting point'
						: picking === 'destination'
							? 'your destination'
							: `a ${picking} area`}</span
				><button onclick={() => (picking = null)}>Cancel</button>
			</div>{/if}
		{#if roomId && !connected && room}<div class="info-banner">
				Reconnecting to controller updates. Travel paused.
			</div>{/if}
		{#if !controller && roomId && room && !owner}<div class="info-banner">
				This traveler is read-only.<button onclick={() => claim(true)}>Take control</button>
			</div>{/if}
		{#if blocked && !controller}<div class="warning-banner">
				<Icon name="rain" />
				<div>
					<strong>Flood ahead. Travel paused.</strong>
					<p>A simulated flood blocks the remaining route.</p>
					<button disabled={rerouting || !editable} onclick={findAlternative}
						>{rerouting ? 'Checking roads…' : 'Find alternative from here'}</button
					>{#if candidates[0]}<button
							disabled={!editable}
							onclick={() => acceptAlternative(candidates[0])}
							>Use flood-avoiding alternative</button
						>{/if}
				</div>
			</div>{/if}
		{#if error || routeError || rainfallError || staleTraffic || staleRainfall}<div
				class="error-banner"
				role="alert"
			>
				{error ||
					routeError ||
					rainfallError ||
					(staleRainfall
						? 'Rainfall assessment is stale. Refresh before continuing.'
						: 'Live traffic estimate is stale. Refresh before continuing.')}{#if !controller && !error}<button
						onclick={() => {
							routeRequest++;
							weatherRequest++;
						}}>Retry</button
					>{/if}{#if roomId}<a href={`/demo/${roomId}/controller`} target="_blank" rel="noreferrer"
						>Open simulation controls</a
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
