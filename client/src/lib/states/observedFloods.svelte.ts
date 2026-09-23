import { CEBU_BOUNDS, type Bounds, type ObservedFloods } from '$lib/types/observedFlood';

export const observedFloodState = $state({
	data: null as ObservedFloods | null,
	loading: true,
	bounds: CEBU_BOUNDS satisfies Bounds,
	request: 0
});

export function updateObservedBounds(bounds: Bounds) {
	const overlapsCebu = (value: Bounds) =>
		value[2] >= CEBU_BOUNDS[0] &&
		value[0] <= CEBU_BOUNDS[2] &&
		value[3] >= CEBU_BOUNDS[1] &&
		value[1] <= CEBU_BOUNDS[3];
	if (overlapsCebu(bounds) !== overlapsCebu(observedFloodState.bounds)) {
		observedFloodState.bounds = bounds;
	}
}

export function retryObservedFloods() {
	observedFloodState.request += 1;
}
