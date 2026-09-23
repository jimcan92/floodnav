import { fetchRoadRoutes, type RoadRoute } from '$lib/services/routingService';
import type { SimulationState } from '$lib/types/demo';
import type { Coordinate } from '$lib/types/navigation';

export async function requestJson(
	path: string,
	method = 'GET',
	payload?: unknown,
	onConflict?: (latest: SimulationState) => void
) {
	const response = await fetch(path, {
		method,
		headers: payload ? { 'Content-Type': 'application/json' } : {},
		body: payload ? JSON.stringify(payload) : undefined,
		signal: AbortSignal.timeout(20000)
	});
	const data = await response.json();
	if (!response.ok) {
		if (response.status === 409 && data.latest) onConflict?.(data.latest);
		throw new Error(data.error || 'Request failed.');
	}
	return data;
}

export async function loadRoadRoutes(
	start: Coordinate,
	end: Coordinate,
	simulated: boolean,
	signal: AbortSignal,
	offline: boolean
) {
	if (!navigator.onLine || offline)
		throw new Error('Internet is needed for new routes. Use the bundled offline demo.');
	if (simulated) return fetchRoadRoutes(start, end, signal);
	try {
		const response = await fetch('/api/demo/routes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ origin: start, destination: end }),
			signal
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		return data as RoadRoute[];
	} catch (error) {
		if (signal.aborted) throw error;
		return fetchRoadRoutes(start, end, signal);
	}
}

export async function loadRainfallAssessment(roads: RoadRoute[], assessmentId: string, signal: AbortSignal) {
	const response = await fetch('/api/assessments', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ roads, assessmentId, loggingEnabled: false }),
		signal
	});
	const data = await response.json();
	if (!response.ok) throw new Error(data.error);
	return data;
}

export async function loadObservedFloods(bounds: number[], signal: AbortSignal) {
	const response = await fetch('/api/observed-floods', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ bounds }),
		signal: AbortSignal.any([signal, AbortSignal.timeout(190000)])
	});
	if (!response.ok) throw new Error('Satellite data unavailable');
	return response.json();
}
