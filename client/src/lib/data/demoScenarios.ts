import direct from './demoRoutes.json';
import bypass from './demoBypass.json';
import { parseRoadRoutes, intersectsFlood } from '../services/routingService';
import type { Coordinate, DemoScenario, FloodHazardZone } from '../types/navigation';
export const DEMO_ORIGIN: Coordinate = [10.3117, 123.8938];
export const DEMO_DESTINATION: Coordinate = [10.3121, 123.9184];
export const DEMO_ROADS = [
	...parseRoadRoutes(direct, 'fixture').slice(0, 1),
	...parseRoadRoutes(bypass, 'fixture').slice(0, 1)
].map((r, i) => ({ ...r, key: `demo_${i}` }));
const zone = (center: Coordinate, id: string): FloodHazardZone => ({
	id,
	center,
	name: 'Demo flood zone',
	affectedRoad: 'Demo route segment',
	radiusMeters: 65,
	depthCm: 80,
	severity: 'impassable',
	reportedTime: 'Scenario fixture',
	description: 'Synthetic flood for testing; not an actual report.',
	active: true
});
const primaryOnly = DEMO_ROADS[0].polyline.find(
	(p, i, path) =>
		i > path.length / 4 &&
		i < (path.length * 3) / 4 &&
		!intersectsFlood(DEMO_ROADS[1].polyline, zone(p, 'bypass'))
);
if (!primaryOnly) throw new Error('Demo fixture requires a separate bypass corridor.');
export function scenarioFloods(scenario: DemoScenario): FloodHazardZone[] {
	if (scenario === 'dry') return [];
	if (scenario === 'bypass') return [zone(primaryOnly!, 'primary-flood')];
	return [
		zone(primaryOnly!, 'primary-flood'),
		zone(DEMO_ROADS[1].polyline[Math.floor(DEMO_ROADS[1].polyline.length / 2)], 'bypass-flood')
	];
}

export function scenarioConditions(scenario: DemoScenario): import('../types/demo').Conditions {
	return {
		trafficSimulation: true,
		floodSimulation: true,
		zones: scenarioFloods(scenario).map((z) => ({
			id: z.id,
			kind: 'flood',
			name: z.name,
			center: z.center,
			radiusMeters: z.radiusMeters,
			depthCm: z.depthCm,
			rainMmH: 10,
			level: 'moderate',
			enabled: true
		}))
	};
}
