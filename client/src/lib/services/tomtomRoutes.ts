import type { RoadRoute } from './routingService';
import type { Coordinate, NavigationStep } from '../types/navigation';
import { cumulativeDistances } from './routingService';
export function parseTomTomRoutes(data: any): RoadRoute[] {
	if (!Array.isArray(data?.routes) || !data.routes.length)
		throw new Error('No traffic-aware route returned.');
	return data.routes.map((r: any, index: number) => {
		const polyline: Coordinate[] = r.legs?.flatMap((leg: any) =>
			leg.points.map((p: any) => [p.latitude, p.longitude])
		);
		if (
			!polyline ||
			polyline.length < 2 ||
			polyline.some(
				(p) => !p.every(Number.isFinite) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180
			) ||
			!Number.isFinite(r.summary?.travelTimeInSeconds) ||
			r.summary.travelTimeInSeconds <= 0 ||
			!Number.isFinite(r.summary.lengthInMeters)
		)
			throw new Error('Invalid TomTom route.');
		const distances = cumulativeDistances(polyline);
		let previous = 0;
		const steps: NavigationStep[] = (r.guidance?.instructions || []).map((s: any, i: number) => {
			const coordinate: Coordinate = [s.point.latitude, s.point.longitude];
			let nearest = previous;
			for (let j = previous; j < polyline.length; j++)
				if (
					Math.hypot(polyline[j][0] - coordinate[0], polyline[j][1] - coordinate[1]) <
					Math.hypot(polyline[nearest][0] - coordinate[0], polyline[nearest][1] - coordinate[1])
				)
					nearest = j;
			previous = nearest;
			return {
				id: `tt_${i}`,
				coordinate,
				progressMeters: distances[nearest],
				instruction: s.message || 'Continue on the route',
				cebuanoInstruction: s.message || 'Padayon',
				distanceMeters: 0,
				durationSeconds: 0,
				maneuver: s.maneuver?.includes('LEFT')
					? 'turn-left'
					: s.maneuver?.includes('RIGHT')
						? 'turn-right'
						: 'straight',
				streetName: s.street || ''
			};
		});
		steps.push({
			id: 'arrival',
			coordinate: polyline.at(-1)!,
			progressMeters: distances.at(-1)!,
			instruction: 'Arrive at your destination',
			cebuanoInstruction: 'Miabot na',
			distanceMeters: 0,
			durationSeconds: 0,
			maneuver: 'arrive',
			streetName: ''
		});
		return {
			key: `tomtom_${index}`,
			polyline,
			steps,
			source: 'tomtom',
			distanceMeters: r.summary.lengthInMeters,
			durationSeconds: r.summary.travelTimeInSeconds,
			baseDurationSeconds: r.summary.noTrafficTravelTimeInSeconds ?? r.summary.travelTimeInSeconds,
			trafficDelaySeconds: r.summary.trafficDelayInSeconds || 0,
			fetchedAt: new Date().toISOString()
		};
	});
}
