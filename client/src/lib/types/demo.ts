import type { Coordinate, DemoScenario, TrafficLevel } from './navigation';
import type { RoadRoute } from '../services/routingService';

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
export interface Telemetry {
	origin: Waypoint;
	destination: Waypoint;
	position: Coordinate;
	route: RoadRoute | null;
	progress: number;
	completedMeters: number;
	remainingSeconds: number;
	status: 'idle' | 'running' | 'paused' | 'blocked' | 'arrived';
	vehicleId: string;
	dataStatus?: { traffic: string; rainfall: string };
}
export interface DemoRoom {
	id: string;
	revision: number;
	sequence: number;
	resetVersion: number;
	preset: DemoScenario | null;
	conditions: Conditions;
	travelerId: string | null;
	telemetry: Telemetry | null;
	updatedAt: string;
}
