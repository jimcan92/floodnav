import type { ObservedFloods } from '$lib/types/observedFlood';
import type { ExposureAssessment } from '$lib/types/rainfall';
import type { RoadRoute } from '$lib/services/routingService';
import { sampleRate } from '$lib/services/rainfallAssessment';

export function travelStatus(input: {
	arrived: boolean;
	gpsTravel: boolean;
	started: boolean;
	playing: boolean;
	busy: boolean;
	blocked: boolean;
	gpsMessage: string;
}) {
	if (input.arrived) return 'arrived';
	if (input.started && input.gpsTravel) {
		if (input.playing) return input.gpsMessage || (input.busy ? 'updating route' : 'GPS tracking');
		return 'paused';
	}
	if (input.blocked) return 'blocked';
	if (input.playing) return 'running';
	if (input.started) return 'paused';
	return 'idle';
}

export function staleTraffic(trafficSimulation: boolean, fetchedAt: string | undefined, clock: number) {
	return !trafficSimulation && !!fetchedAt && clock - Date.parse(fetchedAt) > 300000;
}

export function staleRainfall(
	floodSimulation: boolean,
	assessment: ExposureAssessment | null,
	clock: number
) {
	return (
		!floodSimulation &&
		!!assessment &&
		(clock - Date.parse(assessment.assessedAt) > 15 * 60000 ||
			assessment.weather.samples.some((sample) => sampleRate(sample, clock) === null))
	);
}

export function mainErrorMessage(input: {
	error: string;
	routeError: string;
	rainfallError: string;
	staleRainfall: boolean;
	staleTraffic: boolean;
}) {
	return (
		input.error ||
		input.routeError ||
		input.rainfallError ||
		(input.staleRainfall
			? 'Rainfall assessment is stale. Refresh for updated conditions.'
			: input.staleTraffic
				? 'Live traffic estimate is stale. Refresh for updated timing.'
				: '')
	);
}

export function providerStatusMessage(input: {
	trafficSimulation: boolean;
	floodSimulation: boolean;
	trafficStatus: string;
	assessment: ExposureAssessment | null;
}) {
	return [
		!input.trafficSimulation ? input.trafficStatus || 'Loading live traffic…' : '',
		!input.floodSimulation
			? input.assessment
				? `Rainfall assessed ${new Date(input.assessment.assessedAt).toLocaleTimeString()}`
				: 'Loading rainfall assessment…'
			: ''
	]
		.filter(Boolean)
		.join(' · ');
}

export function urgentStatusMessage(input: {
	blocked: boolean;
	routeError: string;
	started: boolean;
	gpsTravel: boolean;
	gpsMessage: string;
	liveUnavailable: boolean;
}) {
	if (input.blocked) return 'Simulated flood · route blocked';
	if (input.routeError) return 'Route unavailable';
	if (input.started && input.gpsTravel && input.gpsMessage) return input.gpsMessage;
	if (input.started && !input.gpsTravel && input.liveUnavailable)
		return 'Travel paused · check conditions';
	return '';
}

export function notificationCount(flags: unknown[]) {
	return flags.filter(Boolean).length;
}

export function liveUnavailable(input: {
	routeError: string;
	staleTraffic: boolean;
	staleRainfall: boolean;
	floodSimulation: boolean;
	assessment: ExposureAssessment | null;
	rainfallError: string;
}) {
	return (
		!!input.routeError ||
		input.staleTraffic ||
		input.staleRainfall ||
		(!input.floodSimulation && (!input.assessment || !!input.rainfallError))
	);
}

export function observedStale(observed: ObservedFloods | null) {
	return observed?.stale || observed?.status === 'unavailable';
}

export function kmLabel(meters: number, digits = 1) {
	return `${(meters / 1000).toFixed(digits)} km`;
}

export function vehicleEta(estimate: { blocked: boolean; seconds: number } | null, busy: boolean) {
	if (busy) return '…';
	if (!estimate) return '—';
	if (estimate.blocked) return 'Blocked';
	return `${Math.ceil(estimate.seconds / 60)} min`;
}

export function sourceBadge(simulated: boolean, liveLabel: string, simulatedLabel: string) {
	return simulated ? simulatedLabel : liveLabel;
}

export function gpsDeniedMessage(code: number) {
	return code === 1
		? 'Location permission denied. Allow location, then Resume.'
		: 'GPS unavailable — waiting for location';
}

export function nextStepOf(road: RoadRoute | null, progress: number) {
	return road?.steps.find((step) => step.progressMeters > progress + 5) || road?.steps.at(-1);
}
