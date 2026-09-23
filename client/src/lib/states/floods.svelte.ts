import { CEBU_BOUNDS, type Bounds, type ObservedFloods } from '$lib/types/observedFlood';
import { loadObservedFloods } from '$lib/utils/http';

export const floods = $state({
	data: null as ObservedFloods | null,
	loading: true,
	bounds: CEBU_BOUNDS satisfies Bounds,
	request: 0
});

export function updateFloodBounds(bounds: Bounds) {
	const overlapsCebu = (value: Bounds) =>
		value[2] >= CEBU_BOUNDS[0] &&
		value[0] <= CEBU_BOUNDS[2] &&
		value[3] >= CEBU_BOUNDS[1] &&
		value[1] <= CEBU_BOUNDS[3];
	if (overlapsCebu(bounds) !== overlapsCebu(floods.bounds)) floods.bounds = bounds;
}

export function retryFloods() {
	floods.request += 1;
}

export function bindObservedFloodFetch(get: {
	mounted: () => boolean;
	online: () => boolean;
	offlineDemo: () => boolean;
}) {
	const bounds = floods.bounds;
	const request = floods.request;
	void request;
	if (!get.mounted() || !get.online() || get.offlineDemo()) {
		floods.loading = false;
		return;
	}
	const controller = new AbortController();
	const timer = setTimeout(async () => {
		floods.loading = true;
		try {
			const data: ObservedFloods = await loadObservedFloods(bounds, controller.signal);
			if (!controller.signal.aborted) floods.data = data;
		} catch {
			if (!controller.signal.aborted)
				floods.data = floods.data ? { ...floods.data, stale: true } : null;
		} finally {
			if (!controller.signal.aborted) floods.loading = false;
		}
	}, 400);
	return () => {
		clearTimeout(timer);
		controller.abort();
	};
}
