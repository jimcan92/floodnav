<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { env } from '$env/dynamic/public';
	import NavigationMap from '$lib/components/NavigationMap.svelte';
	import SupabaseConnection from '$lib/components/SupabaseConnection.svelte';
	import RainfallPanel from '$lib/components/RainfallPanel.svelte';
	import { rainfallRouteOptions } from '$lib/services/rainfallRoutes';
	import type { ExposureAssessment } from '$lib/types/rainfall';
	import type {
		AppMode,
		Coordinate,
		DemoScenario,
		RoutingStatus,
		RouteOption
	} from '$lib/types/navigation';
	import { DEFAULT_VEHICLE_CATEGORY, VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
	import {
		INITIAL_FLOOD_ZONES,
		PRESET_ORIGINS,
		PRESET_DESTINATIONS
	} from '$lib/data/mockFloodData';
	import {
		DEMO_ORIGIN,
		DEMO_DESTINATION,
		DEMO_ROADS,
		scenarioFloods
	} from '$lib/data/demoScenarios';
	import {
		cumulativeDistances,
		evaluateRoutes,
		fetchRoadRoutes,
		positionAt,
		type RoadRoute
	} from '$lib/services/routingService';
	import {
		fetchSensorReadings,
		sensorIsFresh,
		sensorZones,
		type SensorReading
	} from '$lib/services/sensorService';
	import { loadSupabaseConfig, type SupabaseConfig } from '$lib/services/supabaseConfig';
	import { advanceProgress, WarningGate } from '$lib/services/navigationState';
	import { speechService } from '$lib/services/speechService';

	const fallback: SupabaseConfig = {
		url: env.PUBLIC_SUPABASE_URL || '',
		key: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
	};
	let mounted = $state(false),
		mode = $state<AppMode>('online'),
		floodSource = $state<'mock' | 'supabase' | 'rainfall'>('rainfall');
	let assessment = $state<ExposureAssessment | null>(null);
	let assessmentError = $state('');
	let heldAlternative = $state<RoadRoute | null>(null);
	const rainfall = $derived(mode === 'online' && floodSource === 'rainfall');
	let config = $state<SupabaseConfig>(fallback),
		scenario = $state<DemoScenario>('dry');
	let origin = $state<Coordinate>(DEMO_ORIGIN),
		destination = $state<Coordinate>(DEMO_DESTINATION);
	let vehicle = $state(DEFAULT_VEHICLE_CATEGORY),
		previewVehicle = $state(DEFAULT_VEHICLE_CATEGORY);
	let vehicleDialog: HTMLDialogElement;
	let settingsDialog: HTMLDialogElement;
	let roads = $state<RoadRoute[]>([]),
		status = $state<RoutingStatus>('loading'),
		error = $state(''),
		notice = $state(''),
		retry = $state(0);
	let selected = $state<RouteOption['id']>('primary'),
		playing = $state(false),
		progress = $state(0),
		muted = $state(false),
		locating = $state(false);
	let rows = $state<SensorReading[]>([]),
		sensorError = $state(''),
		sensorLoading = $state(false),
		refresh = $state(0),
		now = $state(Date.now());
	const warnings = new WarningGate();
	let tripVersion = 0,
		spokenStep = '',
		lastGeometry = '';
	let lastPosition: Coordinate = DEMO_ORIGIN;
	const live = $derived(mode === 'online' && floodSource === 'supabase');
	const freshCount = $derived(rows.filter((r) => sensorIsFresh(r, now)).length);
	const sensorsUsable = $derived(rows.length > 0 && freshCount === rows.length && !sensorError);
	const floods = $derived(
		mode === 'demo'
			? scenarioFloods(scenario)
			: rainfall
				? []
				: live
					? sensorZones(rows)
					: INITIAL_FLOOD_ZONES
	);
	const routes = $derived(
		rainfall
			? rainfallRouteOptions(roads, vehicle, assessment, heldAlternative, now)
			: evaluateRoutes(
					roads,
					live ? { ...vehicle, maxSafeWaterDepthCm: 0 } : vehicle,
					floods,
					live ? 'sensor' : 'simulated'
				)
	);
	const active = $derived(selected === 'primary' ? routes.primary : routes.alternativeSafe);
	const total = $derived(active ? cumulativeDistances(active.polyline).at(-1) || 0 : 0);
	const canDrive = $derived(status === 'ready' && !!active?.isPassable && (!live || sensorsUsable));
	const position = $derived(
		active ? positionAt(active.polyline, progress) : progress > 0 ? lastPosition : origin
	);
	const nextStep = $derived(
		active?.steps.find((s) => s.progressMeters > progress + 1) || active?.steps.at(-1)
	);
	const arrived = $derived(total > 0 && progress >= total);
	const remaining = $derived(Math.max(0, total - progress));
	const remainingMinutes = $derived(
		active && total ? (active.durationMinutes * remaining) / total : 0
	);

	onMount(() => {
		config = loadSupabaseConfig(fallback);
		mounted = true;
		const timer = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => {
			clearInterval(timer);
			speechService.cancel();
		};
	});
	function reset() {
		playing = false;
		progress = 0;
		spokenStep = '';
		speechService.cancel();
	}
	function resetInput() {
		reset();
		heldAlternative = null;
		assessment = null;
		tripVersion++;
		warnings.reset();
		selected = 'primary';
	}
	function changeMode(value: AppMode) {
		resetInput();
		mode = value;
		notice = '';
		locating = false;
		if (value === 'demo') {
			origin = DEMO_ORIGIN;
			destination = DEMO_DESTINATION;
		}
	}
	function chooseRoute(id: RouteOption['id']) {
		if (rainfall)
			heldAlternative =
				id === 'alternative_safe'
					? heldAlternative || roads.find((r) => r.key === assessment?.recommendedKey) || null
					: null;
		reset();
		warnings.reset();
		selected = id;
	}
	function connect(value: SupabaseConfig) {
		resetInput();
		rows = [];
		sensorError = '';
		config = value;
	}
	function swapWaypoints() {
		resetInput();
		const temp = origin;
		origin = destination;
		destination = temp;
	}
	function locate() {
		if (!navigator.geolocation) {
			notice = 'GPS is unavailable in this browser.';
			return;
		}
		const version = tripVersion;
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				if (version !== tripVersion) return;
				locating = false;
				resetInput();
				origin = [p.coords.latitude, p.coords.longitude];
				notice = 'GPS origin updated. Travel remains simulated.';
			},
			() => {
				if (version !== tripVersion) return;
				locating = false;
				notice = 'GPS unavailable or permission denied. Existing origin retained.';
			},
			{ timeout: 8000, enableHighAccuracy: true }
		);
	}
	$effect(() => {
		if (!mounted) return;
		const requestedMode = mode,
			start = origin,
			end = destination;
		void retry;
		let disposed = false;
		const controller = new AbortController();
		roads = [];
		error = '';
		status = 'loading';
		if (requestedMode === 'demo') {
			roads = DEMO_ROADS;
			status = 'ready';
			return;
		}
		const timeout = setTimeout(() => controller.abort(), 10000);
		fetchRoadRoutes(start, end, controller.signal)
			.then((result) => {
				if (!disposed) {
					roads = result;
					status = 'ready';
				}
			})
			.catch((reason) => {
				if (!disposed) {
					error = controller.signal.aborted
						? 'Routing timed out. Retry or use Demo scenarios.'
						: reason instanceof Error
							? reason.message
							: 'Routing failed.';
					status = 'error';
				}
			})
			.finally(() => clearTimeout(timeout));
		return () => {
			disposed = true;
			controller.abort();
			clearTimeout(timeout);
		};
	});
	$effect(() => {
		if (!mounted || !live) return;
		const { url, key } = config;
		void refresh;
		let disposed = false,
			timer: ReturnType<typeof setTimeout>,
			controller: AbortController;
		async function poll() {
			controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 8000);
			sensorLoading = true;
			try {
				const data = await fetchSensorReadings(url, key, controller.signal);
				if (!disposed) {
					rows = data;
					sensorError = '';
				}
			} catch (e) {
				if (!disposed) sensorError = e instanceof Error ? e.message : 'Sensor feed unavailable.';
			} finally {
				clearTimeout(timeout);
				if (!disposed) {
					sensorLoading = false;
					now = Date.now();
					timer = setTimeout(poll, 15000);
				}
			}
		}
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
			controller?.abort();
		};
	});
	$effect(() => {
		if (active) lastPosition = position;
	});
	$effect(() => {
		const geometry = active ? JSON.stringify(active.polyline) : '';
		if (!geometry) return;
		if (lastGeometry && lastGeometry !== geometry) {
			playing = false;
			progress = 0;
			spokenStep = '';
			speechService.cancel();
		}
		lastGeometry = geometry;
	});
	$effect(() => {
		if (!canDrive || arrived) playing = false;
	});
	$effect(() => {
		if (!playing || !canDrive || total <= 0) return;
		const length = total;
		const timer = setInterval(() => {
			progress = advanceProgress(progress, 20, length);
		}, 250);
		return () => clearInterval(timer);
	});
	$effect(() => {
		if (!mounted || !playing || !nextStep) return;
		const step = nextStep,
			key = `${selected}:${step.id}`;
		if (spokenStep !== key) {
			spokenStep = key;
			untrack(() =>
				speechService.speakNavigationTurn(
					nextStep.instruction,
					Math.round(Math.max(0, nextStep.progressMeters - progress))
				)
			);
		}
	});
	$effect(() => {
		if (mounted && arrived && warnings.accept('arrival'))
			speechService.speak('You have arrived at your destination.');
	});
	$effect(() => {
		if (!mounted || !active || active.isPassable) return;
		const worst = [...active.floodZonesEncountered].sort((a, b) => b.depthCm - a.depthCm)[0];
		if (worst && warnings.accept(`${selected}:${vehicle.id}:${worst.id}:${worst.depthCm}`))
			speechService.speak(
				`${live ? 'Sensor' : 'Simulation'} alert: route blocked by a ${worst.depthCm} centimeter flood observation.`,
				{ priority: true }
			);
	});
</script>

<svelte:head>
	<title>FloodNav — Flood-aware navigation</title>
	<meta
		name="description"
		content="Metro Cebu rainfall, MGB susceptibility and experimental route recommendations."
	/>
</svelte:head>

<main class="app-shell">
	<aside class="control-panel">
		<fieldset disabled={!mounted} inert={!mounted} class="contents">
			<!-- Header with Logo and Settings Toggle -->
			<header class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
				<div>
					<h1 class="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
						FloodNav <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">Cebu</span>
					</h1>
					<p class="text-xs text-slate-400">Flood-aware navigation</p>
				</div>
				<button
					type="button"
					class="rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 p-2 text-slate-200 text-xs flex items-center gap-1.5 shadow-sm transition"
					onclick={() => settingsDialog.showModal()}
					aria-label="Settings"
					title="Open Settings"
				>
					<span>⚙️</span>
					<span class="font-medium">Settings</span>
				</button>
			</header>

			<!-- Quick Mode and Vehicle Bar -->
			<div class="grid grid-cols-2 gap-2">
				<label class="text-xs text-slate-400">
					Routing mode
					<select
						aria-label="Routing mode"
						value={mode}
						onchange={(e) => changeMode(e.currentTarget.value as AppMode)}
						class="mt-1"
					>
						<option value="online">Online routes</option>
						<option value="demo">Demo scenarios</option>
					</select>
				</label>
				<div class="flex flex-col gap-1 text-xs text-slate-400">
					<span>Vehicle Profile</span>
					<button
						type="button"
						class="w-full mt-0.5 truncate text-left"
						onclick={() => {
							previewVehicle = vehicle;
							vehicleDialog.showModal();
						}}
					>
						Vehicle: {vehicle.title}
					</button>
				</div>
			</div>

			<!-- Trip Planning (Demo vs Online Waypoints) -->
			{#if mode === 'demo'}
				<div class="notice">
					<strong class="text-sky-300">Preset Demo Trip:</strong>
					<p class="text-xs mt-0.5">Fuente Osmeña Circle → SM City Cebu</p>
				</div>
				<label>
					Demo scenario
					<select aria-label="Demo scenario" bind:value={scenario}>
						<option value="dry">Dry roads</option>
						<option value="bypass">Flooded primary / bypass available</option>
						<option value="blocked">All routes blocked</option>
					</select>
				</label>
				<p class="text-xs text-slate-400">
					Bundled OSRM road routes. Google basemap still needs internet.
				</p>
			{:else}
				<!-- Google Maps Style Waypoint Card -->
				<div class="waypoint-card">
					<div class="waypoint-visual">
						<div class="waypoint-start-dot" title="Starting point"></div>
						<div class="waypoint-line"></div>
						<div class="waypoint-dest-pin" title="Destination">📍</div>
					</div>

					<div class="waypoint-fields">
						<!-- Origin -->
						<div class="waypoint-row">
							<label class="waypoint-label" for="origin-select">
								<span class="sr-only">Origin</span>
								<select
									id="origin-select"
									aria-label="Origin"
									class="waypoint-select"
									value={PRESET_ORIGINS.find((p) => p.coordinate.toString() === origin.toString())?.id || 'custom'}
									onchange={(e) => {
										const preset = PRESET_ORIGINS.find((p) => p.id === e.currentTarget.value);
										if (preset) {
											resetInput();
											origin = preset.coordinate;
										}
									}}
								>
									<option value="custom" disabled>GPS / custom origin</option>
									{#each PRESET_ORIGINS as preset}
										<option value={preset.id}>{preset.name}</option>
									{/each}
								</select>
							</label>
							<button
								type="button"
								class="gps-btn"
								onclick={locate}
								disabled={locating}
								title="Use my GPS location"
								aria-label="Use my GPS location"
							>
								{locating ? '…' : '📍'}
							</button>
						</div>

						<!-- Swap Button -->
						<div class="waypoint-divider">
							<button
								type="button"
								class="waypoint-swap-btn"
								onclick={swapWaypoints}
								title="Swap start and destination"
								aria-label="Swap start and destination"
							>
								⇄
							</button>
						</div>

						<!-- Destination -->
						<div class="waypoint-row">
							<label class="waypoint-label" for="destination-select">
								<span class="sr-only">Destination</span>
								<select
									id="destination-select"
									aria-label="Destination"
									class="waypoint-select"
									value={PRESET_DESTINATIONS.find((p) => p.coordinate.toString() === destination.toString())?.id || 'custom'}
									onchange={(e) => {
										const preset = PRESET_DESTINATIONS.find((p) => p.id === e.currentTarget.value);
										if (preset) {
											resetInput();
											destination = preset.coordinate;
										}
									}}
								>
									<option value="custom" disabled>Map pin destination</option>
									{#each PRESET_DESTINATIONS as preset}
										<option value={preset.id}>{preset.name}</option>
									{/each}
								</select>
							</label>
						</div>
					</div>
				</div>
				<p class="text-xs text-slate-400 px-1">
					💡 Click the map to choose another destination.
				</p>

				<!-- Suggested & Popular Destinations (Google Maps Style) -->
				<div class="places-section">
					<div class="flex items-center justify-between px-1 pt-1">
						<span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Popular Cebu Spots</span>
						<span class="text-[10px] text-slate-500">{PRESET_DESTINATIONS.length} locations</span>
					</div>
					<div class="space-y-0.5 max-h-44 overflow-y-auto pr-0.5">
						{#each PRESET_DESTINATIONS as place}
							<button
								type="button"
								class="place-item"
								onclick={() => {
									resetInput();
									destination = place.coordinate;
								}}
							>
								<div class="place-icon-circle">
									{place.icon || '📍'}
								</div>
								<div class="place-details">
									<div class="place-title">{place.name}</div>
									<div class="place-desc">{place.shortDescription}</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Flood Source & Hazard Assessment Engine -->
			{#if mode !== 'demo'}
				<div class="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 space-y-2 text-xs">
					<div class="flex items-center justify-between">
						<span class="font-semibold text-sky-400 uppercase tracking-wider text-[11px]">Flood & Hazard Engine</span>
						<span class="relative flex h-2 w-2">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
							<span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
						</span>
					</div>
					<label>
						Flood source
						<select
							aria-label="Flood source"
							value={floodSource}
							onchange={(e) => {
								resetInput();
								floodSource = e.currentTarget.value as 'mock' | 'supabase' | 'rainfall';
							}}
						>
							<option value="rainfall">Rainfall + MGB susceptibility</option>
							<option value="mock">Simulated floods</option>
							<option value="supabase" disabled>Supabase ESP sensors</option>
						</select>
					</label>
					<p class="text-xs text-slate-400">
						ESP sensors: Temporarily unavailable — rainfall and MGB susceptibility are used for this research phase.
					</p>
					{#if rainfall}
						<RainfallPanel
							{roads}
							onAssessment={(value) => (assessment = value)}
							onError={(err) => (assessmentError = err)}
						/>
					{/if}
					{#if live}
						<section class="notice mt-2" aria-label="Sensor feed status">
							<SupabaseConnection {config} {fallback} onConnect={connect} />
							<strong>ESP sensor feed</strong>
							<p>{freshCount}/{rows.length} sensors have fresh readings · refresh every 15 seconds</p>
							{#if sensorLoading}<p>Checking readings…</p>{/if}
							{#if sensorError}<p role="alert">{sensorError}</p>{/if}
							{#if !sensorsUsable}
								<p>Sensor data missing, stale (over 5 minutes), or unavailable. Simulation is paused; absence of readings is not a dry-road report.</p>
							{/if}
							<button onclick={() => refresh++}>Refresh sensors</button>
							<ul class="mt-2 space-y-1.5" aria-label="Sensor readings">
								{#each rows as sensor (sensor.sensor_id)}
									<li>
										<strong>{sensor.name}</strong>: {sensor.water_depth_cm === null ? 'No reading' : `${sensor.water_depth_cm} cm`}
										<div>{sensor.affected_road} · {sensor.observed_at ? new Date(sensor.observed_at).toLocaleString() : 'Awaiting first reading'}</div>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				</div>
			{/if}

			{#if notice}<p role="status" class="notice">{notice}</p>{/if}
			{#if status === 'loading'}<p role="status" class="notice text-sky-300">Loading road routes…</p>{/if}
			{#if status === 'error'}
				<div role="alert" class="notice border-red-500/50 bg-red-950/30 text-red-200 space-y-2">
					<p>{error}</p>
					<div class="flex gap-2">
						<button
							onclick={() => {
								resetInput();
								retry++;
							}}>Retry routing</button
						>
						<button onclick={() => changeMode('demo')}>Use Demo scenarios</button>
					</div>
				</div>
			{/if}

			<!-- Route Options List -->
			<section aria-label="Route options" class="space-y-2">
				{#each [routes.primary, routes.alternativeSafe].filter((r): r is RouteOption => !!r) as route (route.id)}
					<button
						class:selected={selected === route.id}
						class="route-card text-left"
						aria-pressed={selected === route.id}
						onclick={() => chooseRoute(route.id)}
					>
						<div class="flex items-center justify-between">
							<strong class="text-sm font-bold text-white">{route.name}</strong>
							<span class="text-xs px-2 py-0.5 rounded-md font-medium {route.isPassable ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-red-950/60 text-red-300 border border-red-800'}">
								{route.isPassable ? 'Clear' : 'Blocked'}
							</span>
						</div>
						<span class="text-xs text-slate-300">
							{route.distanceKm.toFixed(2)} km · {Math.ceil(route.durationMinutes)} min · {route.source === 'fixture' ? 'Bundled demo' : 'OSRM'}
						</span>
						<span class="text-xs {route.isPassable ? 'text-sky-300' : 'text-red-300'}">
							{route.summary}
						</span>
					</button>
				{/each}
			</section>

			{#if status === 'ready' && !routes.alternativeSafe}
				<p role="status" class="text-xs text-slate-400">
					{rainfall
						? 'No qualifying lower-exposure alternative available among returned routes.'
						: 'No flood-avoiding alternative found among returned routes.'}
				</p>
			{/if}

			{#if active && !active.isPassable}
				<div role="alert" class="notice text-red-300 border-red-800/80 bg-red-950/40 space-y-2">
					<p>Selected route blocked by {live ? 'sensor-reported water' : 'simulated flood'}. Simulation paused.</p>
					{#if routes.alternativeSafe && selected !== 'alternative_safe'}
						<button
							class="w-full bg-red-900/60 hover:bg-red-800 border border-red-600 rounded-lg p-2 text-white font-medium"
							onclick={() => chooseRoute('alternative_safe')}
						>
							Apply flood-avoiding alternative
						</button>
					{/if}
				</div>
			{/if}

			{#if !active && status === 'ready'}
				<p role="alert" class="notice text-amber-300">
					Selected alternative is unavailable. Choose the primary route to inspect it.
				</p>
			{/if}

			<!-- Waze-Style Navigation Maneuver & Trip Progress -->
			<section aria-label="Navigation progress" class="notice space-y-3">
				<div class="flex items-start gap-3">
					<div class="maneuver-icon-badge" aria-hidden="true">
						{#if arrived}
							🏁
						{:else if nextStep?.instruction.toLowerCase().includes('left')}
							↰
						{:else if nextStep?.instruction.toLowerCase().includes('right')}
							↱
						{:else if nextStep?.instruction.toLowerCase().includes('straight') || nextStep?.instruction.toLowerCase().includes('continue')}
							↑
						{:else}
							➔
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<strong class="block text-sm font-bold text-white leading-snug">
							{arrived ? 'Arrived at destination' : nextStep?.instruction || 'Select a road route'}
						</strong>
						<p class="text-xs text-slate-300 mt-0.5">
							{Math.round(remaining)} m remaining · {Math.ceil(remainingMinutes)} min
						</p>
						{#if nextStep && !arrived}
							<p class="text-xs text-sky-400 font-medium">
								Next maneuver in {Math.round(Math.max(0, nextStep.progressMeters - progress))} m
							</p>
						{/if}
					</div>
				</div>
				<progress
					aria-label="Trip progress"
					value={progress}
					max={total || 1}
					class="w-full h-2 rounded-full overflow-hidden"
				></progress>
			</section>

			<!-- Drive Actions -->
			<div class="flex gap-2">
				<button
					class="drive-btn-primary flex-1"
					class:drive-btn-pause={playing}
					disabled={!canDrive || arrived}
					onclick={() => (playing = !playing)}
				>
					{playing ? 'Pause simulation' : 'Start / resume simulation'}
				</button>
				<button
					class="px-4"
					onclick={() => {
						reset();
						warnings.reset();
					}}
				>
					Reset trip
				</button>
			</div>

			<!-- Voice Audio Controls -->
			<div class="flex gap-2">
				<button
					class="flex-1"
					onclick={() => {
						muted = !muted;
						speechService.setMuted(muted);
					}}
				>
					{muted ? 'Unmute voice' : 'Mute voice'}
				</button>
				<button
					class="flex-1"
					onclick={() => {
						if (!speechService.testVoice())
							notice = 'Speech synthesis is unavailable in this browser.';
					}}
				>
					Test voice
				</button>
			</div>
		</fieldset>
	</aside>

	<!-- Map Canvas -->
	<section class="map-panel" aria-label="Navigation map">
		<!-- Google Maps Category Quick Pills Bar -->
		<div class="top-pill-bar">
			<button
				type="button"
				class="category-pill"
				onclick={() => {
					previewVehicle = vehicle;
					vehicleDialog.showModal();
				}}
			>
				<span>🚗</span>
				<span>{vehicle.title}</span>
			</button>

			<button
				type="button"
				class="category-pill"
				onclick={() => changeMode(mode === 'online' ? 'demo' : 'online')}
			>
				<span>⚡</span>
				<span>{mode === 'online' ? 'Online Mode' : 'Demo Mode'}</span>
			</button>

			<button
				type="button"
				class="category-pill"
				onclick={() => settingsDialog.showModal()}
			>
				<span>🌧️</span>
				<span>{rainfall ? 'Rainfall + MGB Active' : live ? 'ESP Sensors' : 'Simulated'}</span>
			</button>

			{#each PRESET_DESTINATIONS.slice(0, 5) as quickPlace}
				<button
					type="button"
					class="category-pill"
					onclick={() => {
						if (mode !== 'online') changeMode('online');
						resetInput();
						destination = quickPlace.coordinate;
					}}
				>
					<span>{quickPlace.icon || '📍'}</span>
					<span>{quickPlace.name.split(',')[0]}</span>
				</button>
			{/each}
		</div>

		<NavigationMap
			{origin}
			{destination}
			activeRoute={active}
			alternativeRoute={routes.alternativeSafe}
			vehiclePosition={position}
			{vehicle}
			floodZones={floods}
			floodSource={rainfall ? 'rainfall' : live ? 'sensor' : 'simulated'}
			hazardFeatures={rainfall ? assessment?.hazards.features || [] : []}
			weatherSamples={rainfall ? assessment?.weather.samples || [] : []}
			onSelectRoute={chooseRoute}
			onMapClick={mode === 'online'
				? (p) => {
						resetInput();
						destination = p;
					}
				: undefined}
		/>
	</section>
</main>

<!-- Vehicle Dialog -->
<dialog
	bind:this={vehicleDialog}
	aria-label="Vehicle simulation category"
	class="w-[90vw] max-w-xl rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-slate-100 backdrop-blur-xl shadow-2xl backdrop:bg-black/70"
>
	<h2 class="mb-4 text-xl font-bold">Vehicle simulation category</h2>
	<div class="mb-4 flex flex-wrap gap-2">
		{#each VEHICLE_CATEGORIES as category}
			<button
				class="rounded-xl border border-slate-600 p-2 text-sm"
				aria-pressed={previewVehicle.id === category.id}
				onclick={() => (previewVehicle = category)}
			>
				{category.title}
			</button>
		{/each}
	</div>
	<h3 class="font-bold text-lg text-white">{previewVehicle.title}</h3>
	<p class="text-sm text-slate-300 mt-1">{previewVehicle.subtitle}</p>
	<p class="text-sm text-sky-300 mt-1">Demo threshold: {previewVehicle.maxSafeWaterDepthCm} cm</p>
	<p class="my-3 text-sm text-amber-300 bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl">{previewVehicle.warningNotice}</p>
	<div class="flex justify-end gap-3 mt-4">
		<button class="rounded-xl border border-slate-600 px-4 py-2 text-sm" onclick={() => vehicleDialog.close()}>
			Kanselahon (Cancel)
		</button>
		<button
			class="rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 text-sm font-medium"
			onclick={() => {
				vehicle = previewVehicle;
				vehicleDialog.close();
			}}
		>
			Gamita Kini (Select {previewVehicle.title})
		</button>
	</div>
</dialog>

<!-- Settings Modal Dialog -->
<dialog
	bind:this={settingsDialog}
	aria-label="Settings and flood options"
	class="w-[92vw] max-w-lg rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-slate-100 shadow-2xl backdrop-blur-xl backdrop:bg-black/70"
>
	<div class="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
		<h2 class="flex items-center gap-2 text-xl font-bold text-white">
			<span>⚙️</span> FloodNav Settings
		</h2>
		<button
			type="button"
			class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
			onclick={() => settingsDialog.close()}
			aria-label="Close settings"
		>
			✕
		</button>
	</div>

	<div class="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
		<!-- Navigation & Voice Guidance -->
		<div class="space-y-3">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-sky-400">Navigation Preferences</h3>
			<div class="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2 text-xs">
				<div class="flex items-center justify-between">
					<span class="text-slate-300">Vehicle Profile:</span>
					<button
						type="button"
						class="text-sky-400 hover:underline font-medium"
						onclick={() => {
							settingsDialog.close();
							previewVehicle = vehicle;
							vehicleDialog.showModal();
						}}
					>
						{vehicle.title} (Change)
					</button>
				</div>
				<p class="text-slate-400 text-[11px]">
					Threshold: {vehicle.maxSafeWaterDepthCm} cm safe water clearance.
				</p>
			</div>
		</div>

		<!-- Voice & Audio Configuration -->
		<div class="space-y-2 border-t border-slate-800 pt-3">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-sky-400">Voice Guidance</h3>
			<div class="flex gap-2">
				<button
					class="flex-1"
					onclick={() => {
						muted = !muted;
						speechService.setMuted(muted);
					}}
				>
					{muted ? 'Unmute voice' : 'Mute voice'}
				</button>
				<button
					class="flex-1"
					onclick={() => {
						if (!speechService.testVoice())
							notice = 'Speech synthesis is unavailable in this browser.';
					}}
				>
					Test voice
				</button>
			</div>
		</div>
	</div>

	<div class="mt-6 flex justify-end border-t border-slate-800 pt-4">
		<button
			class="rounded-xl bg-sky-600 px-5 py-2 font-medium text-white hover:bg-sky-500"
			onclick={() => settingsDialog.close()}
		>
			Done
		</button>
	</div>
</dialog>
