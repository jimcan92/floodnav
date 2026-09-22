import type { Coordinate, TrafficLevel } from './navigation';

export interface Waypoint {
	name: string;
	coordinate: Coordinate;
}
export interface SimulationZone {
	id: string;
	kind: 'traffic' | 'flood';
	name: string;
	center: Coordinate;
	radiusMeters: number;
	enabled: boolean;
	level: TrafficLevel;
	depthCm: number;
	rainMmH: number;
}
export interface Conditions {
	trafficSimulation: boolean;
	floodSimulation: boolean;
	zones: SimulationZone[];
}
export interface SimulationState {
	revision: number;
	conditions: Conditions;
	updatedAt: string;
}
