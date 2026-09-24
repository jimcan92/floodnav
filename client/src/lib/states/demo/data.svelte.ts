import { DEMO_DESTINATION, DEMO_ORIGIN } from '$lib/data/demoScenarios';
import { DEFAULT_VEHICLE_CATEGORY } from '$lib/data/vehicleCategories';
import { type RoadRoute } from '$lib/services/routingService';
import type { SimulationState, SimulationZone, Waypoint } from '$lib/types/demo';
import type { Coordinate, VehicleCategoryId } from '$lib/types/navigation';
import type { ExposureAssessment } from '$lib/types/rainfall';

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
	originalRoads: [] as RoadRoute[],
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
