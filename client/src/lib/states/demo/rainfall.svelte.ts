import { demoId } from '$lib/services/demoId';
import { loadRainfallAssessment } from '$lib/utils/http';
import { rainfallProviderError } from '$lib/utils/messages';
import { demo, navigation } from './core.svelte';

export function bindRainfallFetch() {
	if (!demo.mounted || navigation.floodSimulation || !demo.roads.length) {
		demo.assessment = null;
		demo.rainfallError = '';
		return;
	}
	const input = demo.roads;
	void demo.weatherRequest;
	let cancelled = false;
	const abort = new AbortController();
	demo.assessment = null;
	demo.rainfallError = '';
	const timer = setTimeout(() => abort.abort(), 120000);
	void loadRainfallAssessment(input, demoId(), abort.signal)
		.then((data) => {
			if (cancelled) return;
			demo.assessment = data;
			demo.rainfallError = rainfallProviderError(data);
		})
		.catch((error) => {
			if (!cancelled)
				demo.rainfallError = abort.signal.aborted
					? 'Rainfall/MGB assessment request timed out. Retry to refresh conditions.'
					: `Rainfall/MGB assessment request failed: ${error.message || 'Provider unavailable.'}`;
		})
		.finally(() => clearTimeout(timer));
	return () => {
		cancelled = true;
		abort.abort();
		clearTimeout(timer);
	};
}
