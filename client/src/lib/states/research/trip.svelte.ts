import { onMount, untrack } from 'svelte';
import { env } from '$env/dynamic/public';
import { rainfallRouteOptions } from '$lib/services/rainfallRoutes';
import type { ExposureAssessment } from '$lib/types/rainfall';
import type {
	AppMode,
	Coordinate,
	DemoScenario,
	RoutingStatus,
	RouteOption
} from '$lib/types/navigation';
import { DEFAULT_VEHICLE_CATEGORY } from '$lib/data/vehicleCategories';
import { INITIAL_FLOOD_ZONES } from '$lib/data/mockFloodData';
import { DEMO_ORIGIN, DEMO_DESTINATION, scenarioFloods } from '$lib/data/demoScenarios';
import {
	cumulativeDistances,
	evaluateRoutes,
	positionAt,
	type RoadRoute
} from '$lib/services/routingService';
import { sensorIsFresh, sensorZones, type SensorReading } from '$lib/services/sensorService';
import { loadSupabaseConfig, type SupabaseConfig } from '$lib/services/supabaseConfig';
import { advanceProgress, WarningGate } from '$lib/services/navigationState';
import { speechService } from '$lib/services/speechService';
import { bindResearchRouting } from './routing';
import { bindResearchSensors } from './sensors';
export function createResearchState() {
	const fallback: SupabaseConfig = {
		url: env.PUBLIC_SUPABASE_URL || '',
		key: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
	};
	const trip = $state({
		mounted: false,
		mode: 'online' as AppMode,
		floodSource: 'rainfall' as 'mock' | 'supabase' | 'rainfall',
		assessment: null as ExposureAssessment | null,
		assessmentError: '',
		heldAlternative: null as RoadRoute | null,
		config: fallback as SupabaseConfig,
		scenario: 'dry' as DemoScenario,
		origin: DEMO_ORIGIN as Coordinate,
		destination: DEMO_DESTINATION as Coordinate,
		vehicle: DEFAULT_VEHICLE_CATEGORY,
		roads: [] as RoadRoute[],
		status: 'loading' as RoutingStatus,
		error: '',
		notice: '',
		retry: 0,
		selected: 'primary' as RouteOption['id'],
		playing: false,
		progress: 0,
		muted: false,
		locating: false,
		rows: [] as SensorReading[],
		sensorError: '',
		sensorLoading: false,
		refresh: 0,
		now: Date.now()
	});

	const rainfall = $derived(trip.mode === 'online' && trip.floodSource === 'rainfall');

	const warnings = new WarningGate();
	let tripVersion = 0,
		spokenStep = '',
		lastGeometry = '';
	let lastPosition: Coordinate = DEMO_ORIGIN;
	const live = $derived(trip.mode === 'online' && trip.floodSource === 'supabase');
	const freshCount = $derived(trip.rows.filter((r) => sensorIsFresh(r, trip.now)).length);
	const sensorsUsable = $derived(
		trip.rows.length > 0 && freshCount === trip.rows.length && !trip.sensorError
	);
	const floods = $derived(
		trip.mode === 'demo'
			? scenarioFloods(trip.scenario)
			: rainfall
				? []
				: live
					? sensorZones(trip.rows)
					: INITIAL_FLOOD_ZONES
	);
	const routes = $derived(
		rainfall
			? rainfallRouteOptions(
					trip.roads,
					trip.vehicle,
					trip.assessment,
					trip.heldAlternative,
					trip.now
				)
			: evaluateRoutes(
					trip.roads,
					live ? { ...trip.vehicle, maxSafeWaterDepthCm: 0 } : trip.vehicle,
					floods,
					live ? 'sensor' : 'simulated'
				)
	);
	const active = $derived(trip.selected === 'primary' ? routes.primary : routes.alternativeSafe);
	const total = $derived(active ? cumulativeDistances(active.polyline).at(-1) || 0 : 0);
	const canDrive = $derived(
		trip.status === 'ready' && !!active?.isPassable && (!live || sensorsUsable)
	);
	const position = $derived(
		active
			? positionAt(active.polyline, trip.progress)
			: trip.progress > 0
				? lastPosition
				: trip.origin
	);
	const nextStep = $derived(
		active?.steps.find((s) => s.progressMeters > trip.progress + 1) || active?.steps.at(-1)
	);
	const arrived = $derived(total > 0 && trip.progress >= total);
	const remaining = $derived(Math.max(0, total - trip.progress));
	const remainingMinutes = $derived(
		active && total ? (active.durationMinutes * remaining) / total : 0
	);
	onMount(() => {
		trip.config = loadSupabaseConfig(fallback);
		trip.mounted = true;
		const timer = setInterval(() => {
			trip.now = Date.now();
		}, 1000);
		return () => {
			clearInterval(timer);
			trip.mounted = false;
			tripVersion++;
			speechService.cancel();
		};
	});
	function reset() {
		trip.playing = false;
		trip.progress = 0;
		spokenStep = '';
		speechService.cancel();
	}
	function resetInput() {
		reset();
		trip.heldAlternative = null;
		trip.assessment = null;
		tripVersion++;
		warnings.reset();
		trip.selected = 'primary';
	}
	function changeMode(value: AppMode) {
		resetInput();
		trip.mode = value;
		trip.notice = '';
		trip.locating = false;
		if (value === 'demo') {
			trip.origin = DEMO_ORIGIN;
			trip.destination = DEMO_DESTINATION;
		}
	}
	function chooseRoute(id: RouteOption['id']) {
		if (rainfall)
			trip.heldAlternative =
				id === 'alternative_safe'
					? trip.heldAlternative ||
						trip.roads.find((r) => r.key === trip.assessment?.recommendedKey) ||
						null
					: null;
		reset();
		warnings.reset();
		trip.selected = id;
	}
	function connect(value: SupabaseConfig) {
		resetInput();
		trip.rows = [];
		trip.sensorError = '';
		trip.config = value;
	}
	function swapWaypoints() {
		resetInput();
		const temp = trip.origin;
		trip.origin = trip.destination;
		trip.destination = temp;
	}
	function locate() {
		if (!navigator.geolocation) {
			trip.notice = 'GPS is unavailable in this browser.';
			return;
		}
		const version = tripVersion;
		trip.locating = true;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				if (version !== tripVersion) return;
				trip.locating = false;
				resetInput();
				trip.origin = [p.coords.latitude, p.coords.longitude];
				trip.notice = 'GPS origin updated. Travel remains simulated.';
			},
			() => {
				if (version !== tripVersion) return;
				trip.locating = false;
				trip.notice = 'GPS unavailable or permission denied. Existing origin retained.';
			},
			{ timeout: 8000, enableHighAccuracy: true }
		);
	}
	const research = {
		trip,

		get rainfall() {
			return rainfall;
		},
		get live() {
			return live;
		},
		get freshCount() {
			return freshCount;
		},
		get sensorsUsable() {
			return sensorsUsable;
		},
		get floods() {
			return floods;
		},
		get routes() {
			return routes;
		},
		get active() {
			return active;
		},
		get total() {
			return total;
		},
		get canDrive() {
			return canDrive;
		},
		get position() {
			return position;
		},
		get nextStep() {
			return nextStep;
		},
		get arrived() {
			return arrived;
		},
		get remaining() {
			return remaining;
		},
		get remainingMinutes() {
			return remainingMinutes;
		},
		reset,
		resetInput,
		changeMode,
		chooseRoute,
		connect,
		swapWaypoints,
		locate,
		fallback,
		warnings
	};
	$effect(() => bindResearchRouting(research));
	$effect(() => bindResearchSensors(research));
	$effect(() => {
		if (active) lastPosition = position;
	});
	$effect(() => {
		const geometry = active ? JSON.stringify(active.polyline) : '';
		if (!geometry) return;
		if (lastGeometry && lastGeometry !== geometry) {
			trip.playing = false;
			trip.progress = 0;
			spokenStep = '';
			speechService.cancel();
		}
		lastGeometry = geometry;
	});
	$effect(() => {
		if (!canDrive || arrived) trip.playing = false;
	});
	$effect(() => {
		if (!trip.playing || !canDrive || total <= 0) return;
		const length = total;
		const timer = setInterval(() => {
			trip.progress = advanceProgress(trip.progress, 20, length);
		}, 250);
		return () => clearInterval(timer);
	});
	$effect(() => {
		if (!trip.mounted || !trip.playing || !nextStep) return;
		const step = nextStep,
			key = `${trip.selected}:${step.id}`;
		if (spokenStep !== key) {
			spokenStep = key;
			untrack(() =>
				speechService.speakNavigationTurn(
					nextStep.instruction,
					Math.round(Math.max(0, nextStep.progressMeters - trip.progress))
				)
			);
		}
	});
	$effect(() => {
		if (trip.mounted && arrived && warnings.accept('arrival'))
			speechService.speak('You have arrived at your destination.');
	});
	$effect(() => {
		if (!trip.mounted || !active || active.isPassable) return;
		const worst = [...active.floodZonesEncountered].sort((a, b) => b.depthCm - a.depthCm)[0];
		if (
			worst &&
			warnings.accept(`${trip.selected}:${trip.vehicle.id}:${worst.id}:${worst.depthCm}`)
		)
			speechService.speak(
				`${live ? 'Sensor' : 'Simulation'} alert: route blocked by a ${worst.depthCm} centimeter flood observation.`,
				{ priority: true }
			);
	});
	return research;
}
export type ResearchState = ReturnType<typeof createResearchState>;
