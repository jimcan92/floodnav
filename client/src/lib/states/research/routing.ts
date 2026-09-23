import { DEMO_ROADS } from '$lib/data/demoScenarios';
import { fetchRoadRoutes } from '$lib/services/routingService';
import type { ResearchState } from './trip.svelte';
export function bindResearchRouting(research: ResearchState) {
	if (!research.trip.mounted) return;
	const requestedMode = research.trip.mode,
		start = research.trip.origin,
		end = research.trip.destination;
	void research.trip.retry;
	let disposed = false;
	const controller = new AbortController();
	research.trip.roads = [];
	research.trip.error = '';
	research.trip.status = 'loading';
	if (requestedMode === 'demo') {
		research.trip.roads = DEMO_ROADS;
		research.trip.status = 'ready';
		return;
	}
	const timeout = setTimeout(() => controller.abort(), 10000);
	fetchRoadRoutes(start, end, controller.signal)
		.then((result) => {
			if (!disposed) {
				research.trip.roads = result;
				research.trip.status = 'ready';
			}
		})
		.catch((reason) => {
			if (!disposed) {
				research.trip.error = controller.signal.aborted
					? 'Routing timed out. Retry or use Demo scenarios.'
					: reason instanceof Error
						? reason.message
						: 'Routing failed.';
				research.trip.status = 'error';
			}
		})
		.finally(() => clearTimeout(timeout));
	return () => {
		disposed = true;
		controller.abort();
		clearTimeout(timeout);
	};
}
