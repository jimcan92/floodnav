import { demoId } from '$lib/services/demoId';
import { loadRainfallAssessment } from '$lib/utils/http';
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
			if (
				!data.hazards.verified ||
				data.weather.errors.length ||
				data.routes.some((route: { score: number | null }) => route.score === null)
			)
				demo.rainfallError =
					'Live rainfall assessment incomplete. GPS navigation remains available; flood conditions are unconfirmed.';
		})
		.catch((error) => {
			if (!cancelled) demo.rainfallError = error.message || 'Rainfall unavailable.';
		})
		.finally(() => clearTimeout(timer));
	return () => {
		cancelled = true;
		abort.abort();
		clearTimeout(timer);
	};
}
