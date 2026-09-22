import type { RouteOption, VehicleCategory } from '../types/navigation';
import type { ExposureAssessment } from '../types/rainfall';
import { sampleRate } from './rainfallAssessment';
import { evaluateRoutes, type RoadRoute } from './routingService';

export function rainfallRouteOptions(
	roads: RoadRoute[],
	vehicle: VehicleCategory,
	assessment: ExposureAssessment | null,
	held: RoadRoute | null,
	now: number
): { primary: RouteOption | null; alternativeSafe: RouteOption | null } {
	const fresh =
		!!assessment &&
		assessment.routes.every((r) => r.score !== null) &&
		assessment.weather.samples.every((s) => sampleRate(s, now) !== null) &&
		assessment.hazards.verified;
	const make = (road: RoadRoute, alternative: boolean): RouteOption => {
		const base = evaluateRoutes([road], vehicle, []).primary!;
		const score = fresh ? assessment.routes.find((r) => r.key === road.key)?.score : null;
		const deltaTime = (road.durationSeconds - roads[0].durationSeconds) / 60;
		const deltaDistance = (road.distanceMeters - roads[0].distanceMeters) / 1000;
		return {
			...base,
			id: alternative ? 'alternative_safe' : 'primary',
			isAlternativeSafeRoute: false,
			name: alternative ? 'Alternative road route' : 'Primary road route',
			summary: `${score == null ? 'Assessment unavailable' : `Experimental exposure ${score.toFixed(2)}`}${alternative ? ` · ${deltaTime >= 0 ? '+' : ''}${deltaTime.toFixed(1)} min · ${deltaDistance >= 0 ? '+' : ''}${deltaDistance.toFixed(2)} km` : ''}${alternative && assessment?.recommendedKey === road.key && fresh ? ' · Lower estimated exposure' : ''}. Flood conditions unconfirmed.`
		};
	};
	const alternative =
		held || (fresh ? roads.find((r) => r.key === assessment.recommendedKey) : null);
	return {
		primary: roads[0] ? make(roads[0], false) : null,
		alternativeSafe: alternative ? make(alternative, true) : null
	};
}
