<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { env } from '$env/dynamic/public';
	import NavigationMap from '$lib/components/NavigationMap.svelte';
	import SupabaseConnection from '$lib/components/SupabaseConnection.svelte';
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
		floodSource = $state<'mock' | 'supabase'>('supabase');
	let config = $state<SupabaseConfig>(fallback),
		scenario = $state<DemoScenario>('dry');
	let origin = $state<Coordinate>(DEMO_ORIGIN),
		destination = $state<Coordinate>(DEMO_DESTINATION);
	let vehicle = $state(DEFAULT_VEHICLE_CATEGORY),
		previewVehicle = $state(DEFAULT_VEHICLE_CATEGORY);
	let vehicleDialog: HTMLDialogElement;
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
		mode === 'demo' ? scenarioFloods(scenario) : live ? sensorZones(rows) : INITIAL_FLOOD_ZONES
	);
	const routes = $derived(
		evaluateRoutes(
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
					step.instruction,
					Math.round(Math.max(0, step.progressMeters - progress))
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

<svelte:head
	><title>FloodNav — Flood-aware navigation</title><meta
		name="description"
		content="Cebu flood observation and navigation prototype with Google maps and ESP sensor readings."
	/></svelte:head
>
<main class="app-shell">
	<aside class="control-panel">
		<fieldset disabled={!mounted} inert={!mounted} class="contents">
			<header>
				<h1 class="text-2xl font-black">FloodNav <span class="text-sm text-sky-300">Cebu</span></h1>
				<p class="text-sm text-slate-300">Leaflet + Google · Navigation prototype</p>
			</header>
			<p class="notice">
				{live
					? 'Flood readings: ESP sensors via Supabase. Avoid all reported water; sensor coverage does not establish road safety.'
					: 'Floods and vehicle thresholds are simulated.'} Traffic and travel remain simulated. Driving
				profile applies to all vehicle examples.
			</p>
			<label
				>Routing mode<select
					aria-label="Routing mode"
					value={mode}
					onchange={(e) => changeMode(e.currentTarget.value as AppMode)}
					><option value="online">Online routes</option><option value="demo">Demo scenarios</option
					></select
				></label
			>
			{#if mode === 'demo'}
				<p>Preset trip: Fuente Osmeña → SM City Cebu</p>
				<label
					>Demo scenario<select aria-label="Demo scenario" bind:value={scenario}
						><option value="dry">Dry roads</option><option value="bypass"
							>Flooded primary / bypass available</option
						><option value="blocked">All routes blocked</option></select
					></label
				>
				<p class="text-xs text-slate-400">
					Bundled OSRM road routes. Google basemap still needs internet.
				</p>
			{:else}
				<label
					>Flood source<select
						aria-label="Flood source"
						value={floodSource}
						onchange={(e) => {
							resetInput();
							floodSource = e.currentTarget.value as 'mock' | 'supabase';
						}}
						><option value="mock">Simulated floods</option><option value="supabase"
							>Supabase ESP sensors</option
						></select
					></label
				>
				{#if live}
					<section class="notice" aria-label="Sensor feed status">
						<SupabaseConnection {config} {fallback} onConnect={connect} />
						<strong>ESP sensor feed</strong>
						<p>{freshCount}/{rows.length} sensors have fresh readings · refresh every 15 seconds</p>
						{#if sensorLoading}<p>Checking readings…</p>{/if}
						{#if sensorError}<p role="alert">{sensorError}</p>{/if}
						{#if !sensorsUsable}<p>
								Sensor data missing, stale (over 5 minutes), or unavailable. Simulation is paused;
								absence of readings is not a dry-road report.
							</p>{/if}
						<button onclick={() => refresh++}>Refresh sensors</button>
						<ul class="mt-3 space-y-2" aria-label="Sensor readings">
							{#each rows as sensor (sensor.sensor_id)}<li>
									<strong>{sensor.name}</strong>: {sensor.water_depth_cm === null
										? 'No reading'
										: `${sensor.water_depth_cm} cm`}
									<div>
										{sensor.affected_road} · {sensor.observed_at
											? new Date(sensor.observed_at).toLocaleString()
											: 'Awaiting first reading'}
									</div>
								</li>{/each}
						</ul>
					</section>
				{/if}
				<label
					>Origin<select
						aria-label="Origin"
						value={PRESET_ORIGINS.find((p) => p.coordinate.toString() === origin.toString())?.id ||
							'custom'}
						onchange={(e) => {
							const preset = PRESET_ORIGINS.find((p) => p.id === e.currentTarget.value);
							if (preset) {
								resetInput();
								origin = preset.coordinate;
							}
						}}
						><option value="custom" disabled>GPS / custom origin</option
						>{#each PRESET_ORIGINS as preset}<option value={preset.id}>{preset.name}</option
							>{/each}</select
					></label
				>
				<button onclick={locate} disabled={locating}
					>{locating ? 'Locating…' : 'Use my GPS location'}</button
				>
				<label
					>Destination<select
						aria-label="Destination"
						value={PRESET_DESTINATIONS.find(
							(p) => p.coordinate.toString() === destination.toString()
						)?.id || 'custom'}
						onchange={(e) => {
							const preset = PRESET_DESTINATIONS.find((p) => p.id === e.currentTarget.value);
							if (preset) {
								resetInput();
								destination = preset.coordinate;
							}
						}}
						><option value="custom" disabled>Map pin destination</option
						>{#each PRESET_DESTINATIONS as preset}<option value={preset.id}>{preset.name}</option
							>{/each}</select
					></label
				>
				<p class="text-xs text-slate-400">Click the map to choose another destination.</p>
			{/if}
			<button
				onclick={() => {
					previewVehicle = vehicle;
					vehicleDialog.showModal();
				}}>Vehicle: {vehicle.title}</button
			>
			<p class="text-xs text-slate-400">
				Demo threshold: {vehicle.maxSafeWaterDepthCm} cm — not a wading rating.
			</p>
			{#if notice}<p role="status" class="notice">{notice}</p>{/if}
			{#if status === 'loading'}<p role="status">Loading road routes…</p>{/if}
			{#if status === 'error'}<div role="alert">
					<p>{error}</p>
					<button
						onclick={() => {
							resetInput();
							retry++;
						}}>Retry routing</button
					><button onclick={() => changeMode('demo')}>Use Demo scenarios</button>
				</div>{/if}
			<section aria-label="Route options" class="space-y-2">
				{#each [routes.primary, routes.alternativeSafe].filter((r): r is RouteOption => !!r) as route (route.id)}<button
						class:selected={selected === route.id}
						class="route-card"
						aria-pressed={selected === route.id}
						onclick={() => chooseRoute(route.id)}
						><strong>{route.name}</strong><span
							>{route.distanceKm.toFixed(2)} km · {Math.ceil(route.durationMinutes)} min · {route.source ===
							'fixture'
								? 'Bundled demo'
								: 'OSRM'}</span
						><span class={route.isPassable ? 'text-sky-300' : 'text-red-300'}>{route.summary}</span
						></button
					>{/each}
			</section>
			{#if status === 'ready' && !routes.alternativeSafe}<p role="status">
					No flood-avoiding alternative found among returned routes.
				</p>{/if}
			{#if active && !active.isPassable}<div role="alert" class="notice text-red-300">
					Selected route blocked by {live ? 'sensor-reported water' : 'simulated flood'}. Simulation
					paused.{#if routes.alternativeSafe && selected !== 'alternative_safe'}<button
							onclick={() => chooseRoute('alternative_safe')}
							>Apply flood-avoiding alternative</button
						>{/if}
				</div>{/if}
			{#if !active && status === 'ready'}<p role="alert">
					Selected alternative is unavailable. Choose the primary route to inspect it.
				</p>{/if}
			<div class="flex flex-wrap gap-2">
				<button disabled={!canDrive || arrived} onclick={() => (playing = !playing)}
					>{playing ? 'Pause simulation' : 'Start / resume simulation'}</button
				><button
					onclick={() => {
						reset();
						warnings.reset();
					}}>Reset trip</button
				>
			</div>
			<section aria-label="Navigation progress" class="notice">
				<strong
					>{arrived
						? 'Arrived at destination'
						: nextStep?.instruction || 'Select a road route'}</strong
				>
				<p>{Math.round(remaining)} m remaining · {Math.ceil(remainingMinutes)} min</p>
				{#if nextStep && !arrived}<p>
						Next maneuver in {Math.round(Math.max(0, nextStep.progressMeters - progress))} m
					</p>{/if}<progress
					aria-label="Trip progress"
					value={progress}
					max={total || 1}
					class="w-full"
				></progress>
			</section>
			<div class="flex gap-2">
				<button
					onclick={() => {
						muted = !muted;
						speechService.setMuted(muted);
					}}>{muted ? 'Unmute voice' : 'Mute voice'}</button
				><button
					onclick={() => {
						if (!speechService.testVoice())
							notice = 'Speech synthesis is unavailable in this browser.';
					}}>Test voice</button
				>
			</div>
		</fieldset>
	</aside>
	<section class="map-panel" aria-label="Navigation map">
		<NavigationMap
			{origin}
			{destination}
			activeRoute={active}
			alternativeRoute={routes.alternativeSafe}
			vehiclePosition={position}
			{vehicle}
			floodZones={floods}
			floodSource={live ? 'sensor' : 'simulated'}
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
<dialog
	bind:this={vehicleDialog}
	aria-label="Vehicle simulation category"
	class="w-[90vw] max-w-xl rounded-xl border border-slate-600 bg-slate-900 p-6 text-slate-100 backdrop:bg-black/70"
>
	<h2 class="mb-4 text-xl font-bold">Vehicle simulation category</h2>
	<div class="mb-4 flex flex-wrap gap-2">
		{#each VEHICLE_CATEGORIES as category}<button
				class="rounded border border-slate-600 p-2"
				aria-pressed={previewVehicle.id === category.id}
				onclick={() => (previewVehicle = category)}>{category.title}</button
			>{/each}
	</div>
	<h3>{previewVehicle.title}</h3>
	<p>{previewVehicle.subtitle}</p>
	<p>Demo threshold: {previewVehicle.maxSafeWaterDepthCm} cm</p>
	<p class="my-3 text-amber-300">{previewVehicle.warningNotice}</p>
	<div class="flex gap-3">
		<button class="rounded border p-2" onclick={() => vehicleDialog.close()}
			>Kanselahon (Cancel)</button
		><button
			class="rounded bg-blue-700 p-2"
			onclick={() => {
				vehicle = previewVehicle;
				vehicleDialog.close();
			}}>Gamita Kini (Select {previewVehicle.title})</button
		>
	</div>
</dialog>
