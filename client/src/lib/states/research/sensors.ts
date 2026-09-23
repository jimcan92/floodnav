import { fetchSensorReadings } from '$lib/services/sensorService';
import type { ResearchState } from './trip.svelte';
export function bindResearchSensors(research: ResearchState) {
	if (!research.trip.mounted || !research.live) return;
	const { url, key } = research.trip.config;
	void research.trip.refresh;
	let disposed = false,
		timer: ReturnType<typeof setTimeout>,
		controller: AbortController;
	async function poll() {
		controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);
		research.trip.sensorLoading = true;
		try {
			const data = await fetchSensorReadings(url, key, controller.signal);
			if (!disposed) {
				research.trip.rows = data;
				research.trip.sensorError = '';
			}
		} catch (e) {
			if (!disposed)
				research.trip.sensorError = e instanceof Error ? e.message : 'Sensor feed unavailable.';
		} finally {
			clearTimeout(timeout);
			if (!disposed) {
				research.trip.sensorLoading = false;
				research.trip.now = Date.now();
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
}
