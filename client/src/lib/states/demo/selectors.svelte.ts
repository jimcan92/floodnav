import { DEFAULT_VEHICLE_CATEGORY, VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
import {
	evaluateSimulation,
	rankSimulationRoutes,
	remainingPath
} from '$lib/services/demoSimulation';
import {
	actionableObservedFloods,
	intersectsObservedFlood,
	recentObservedFloods
} from '$lib/services/observedFlood';
import { pwaState } from '$lib/services/pwaState.svelte';
import { cumulativeDistances, positionAt } from '$lib/services/routingService';
import { floods } from '$lib/states/floods.svelte';
import { layout } from '$lib/states/layout.svelte';
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
import { samePolyline } from '$lib/utils/route';
import { demo } from './data.svelte';
const currentSimulation = $derived(demo.offlineDemo ? demo.localSimulation : demo.shared);
const conditions = $derived(
	currentSimulation?.conditions || { trafficSimulation: false, floodSimulation: false, zones: [] }
);
const trafficSimulation = $derived(conditions.trafficSimulation);
const floodSimulation = $derived(conditions.floodSimulation);
const travelMode = $derived(
	demo.requestedMode || (trafficSimulation || floodSimulation ? 'demo' : 'gps')
);
const gpsTravel = $derived(travelMode === 'gps');
const editable = $derived(demo.mounted && (demo.offlineDemo || demo.connected));
const sharedReady = $derived(!!currentSimulation);
const vehicle = $derived(
	VEHICLE_CATEGORIES.find((item) => item.id === demo.vehicleId) || DEFAULT_VEHICLE_CATEGORY
);
const ownRoad = $derived(
	demo.roads.find((road) => road.key === demo.selectedKey) || demo.roads[0] || null
);
const observedPath = $derived(ownRoad ? remainingPath(ownRoad.polyline, demo.progress) : []);
const observedEncounters = $derived(
	recentObservedFloods(
		pwaState.online && !demo.offlineDemo ? floods.data : null,
		demo.clock
	).filter((feature) => intersectsObservedFlood(observedPath, feature.geometry))
);
const observedAvoidance = $derived(actionableObservedFloods(floods.data, demo.clock));
const canAvoidObserved = $derived(
	!demo.offlineDemo &&
		pwaState.online &&
		observedAvoidance.some((feature) => intersectsObservedFlood(observedPath, feature.geometry))
);
const position = $derived(
	demo.started && gpsTravel && demo.gpsPosition
		? demo.gpsPosition
		: ownRoad
			? positionAt(ownRoad.polyline, demo.progress)
			: demo.origin.coordinate
);
const visibleZones = $derived(
	(drawerOpenValue() || layout.picking === 'traffic' || layout.picking === 'flood') &&
		demo.previewZones
		? demo.previewZones
		: conditions.zones.filter((zone) =>
				zone.kind === 'traffic' ? trafficSimulation : floodSimulation
			)
);
const evaluation = $derived(
	ownRoad
		? evaluateSimulation(
				ownRoad,
				conditions,
				vehicle.maxSafeWaterDepthCm,
				demo.progress,
				vehicle.id
			)
		: null
);
const ranked = $derived(
	rankSimulationRoutes(demo.roads, conditions, vehicle.maxSafeWaterDepthCm, vehicle.id)
);
const timing = $derived(evaluation?.segments || []);
const total = $derived(ownRoad ? cumulativeDistances(ownRoad.polyline).at(-1) || 0 : 0);
const remainingSeconds = $derived(evaluation?.seconds || 0);
const blocked = $derived(evaluation?.blocked || false);
const arrived = $derived(
	demo.started && gpsTravel ? demo.gpsArrived : total > 0 && demo.progress >= total
);
const staleTraffic = $derived(
	staleTrafficOf(conditions.trafficSimulation, ownRoad?.fetchedAt, demo.clock)
);
const staleRainfall = $derived(staleRainfallOf(floodSimulation, demo.assessment, demo.clock));
const liveUnavailable = $derived(
	liveUnavailableOf({
		routeError: demo.routeError,
		staleTraffic,
		staleRainfall,
		floodSimulation,
		assessment: demo.assessment,
		rainfallError: demo.rainfallError
	})
);
const nextStep = $derived(nextStepOf(ownRoad, demo.progress));
const status = $derived(
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
const remainingMeters = $derived(Math.max(0, total - demo.progress));
const alternative = $derived(
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
const routeAlternatives = $derived(
	(demo.candidates.length
		? demo.candidates
		: demo.progress === 0
			? ranked.filter((result) => !result.blocked).map((result) => result.road)
			: []
	).filter(
		(road, index, roads) =>
			road.key !== ownRoad?.key &&
			!samePolyline(road.polyline, ownRoad?.polyline || []) &&
			roads.findIndex((other) => samePolyline(other.polyline, road.polyline)) === index
	)
);
const alternativeEvaluation = $derived(
	alternative
		? evaluateSimulation(alternative, conditions, vehicle.maxSafeWaterDepthCm, 0, vehicle.id)
		: null
);
const mainError = $derived(
	mainErrorMessage({
		error: demo.error,
		routeError: demo.routeError,
		rainfallError: demo.rainfallError,
		staleRainfall,
		staleTraffic
	})
);
const providerMessage = $derived(
	providerStatusMessage({
		trafficSimulation,
		floodSimulation,
		trafficStatus: demo.trafficStatus,
		assessment: demo.assessment,
		rainfallError: demo.rainfallError,
		staleRainfall
	})
);
const notices = $derived(
	countFlags([
		demo.offlineDemo,
		!demo.connected && demo.shared && !demo.offlineDemo,
		demo.started && gpsTravel && demo.gpsMessage,
		demo.syncError && !demo.offlineDemo,
		blocked,
		demo.started && alternative && alternativeEvaluation,
		mainError,
		demo.notice,
		observedEncounters.length > 0,
		observedStale(floods.data)
	])
);
const urgentMessage = $derived(
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

export const navigation = {
	get currentSimulation() {
		return currentSimulation;
	},
	get conditions() {
		return conditions;
	},
	get trafficSimulation() {
		return trafficSimulation;
	},
	get floodSimulation() {
		return floodSimulation;
	},
	get travelMode() {
		return travelMode;
	},
	get gpsTravel() {
		return gpsTravel;
	},
	get editable() {
		return editable;
	},
	get sharedReady() {
		return sharedReady;
	},
	get vehicle() {
		return vehicle;
	},
	get ownRoad() {
		return ownRoad;
	},
	get observedPath() {
		return observedPath;
	},
	get observedEncounters() {
		return observedEncounters;
	},
	get observedAvoidance() {
		return observedAvoidance;
	},
	get canAvoidObserved() {
		return canAvoidObserved;
	},
	get position() {
		return position;
	},
	get visibleZones() {
		return visibleZones;
	},
	get evaluation() {
		return evaluation;
	},
	get ranked() {
		return ranked;
	},
	get timing() {
		return timing;
	},
	get total() {
		return total;
	},
	get remainingSeconds() {
		return remainingSeconds;
	},
	get blocked() {
		return blocked;
	},
	get arrived() {
		return arrived;
	},
	get staleTraffic() {
		return staleTraffic;
	},
	get staleRainfall() {
		return staleRainfall;
	},
	get liveUnavailable() {
		return liveUnavailable;
	},
	get nextStep() {
		return nextStep;
	},
	get status() {
		return status;
	},
	get remainingMeters() {
		return remainingMeters;
	},
	get routeAlternatives() {
		return routeAlternatives;
	},
	get alternative() {
		return alternative;
	},
	get alternativeEvaluation() {
		return alternativeEvaluation;
	},
	get mainError() {
		return mainError;
	},
	get providerMessage() {
		return providerMessage;
	},
	get notices() {
		return notices;
	},
	get urgentMessage() {
		return urgentMessage;
	}
};
