export type Coordinate = [number, number]; // [lat, lng]
export type MapLayer = 'Hybrid' | 'Satellite' | 'Streets';
export type AppMode = 'online' | 'demo';
export type DemoScenario = 'dry' | 'bypass' | 'blocked';
export type RoutingStatus = 'loading' | 'ready' | 'error';

export type VehicleCategoryId =
	'low_clearance' | 'medium_clearance' | 'high_clearance' | 'motorcycle' | 'bicycle';

export interface VehicleCategory {
	id: VehicleCategoryId;
	title: string;
	subtitle: string;
	groundClearanceRange: string;
	groundClearanceMm: number;
	maxSafeWaterDepthCm: number;
	badgeColor: string;
	description: string;
	warningNotice: string;
	sampleModels: string[];
	sampleImages: {
		title: string;
		model: string;
		imageUrl: string;
		clearance: string;
	}[];
}

export type TrafficLevel = 'light' | 'moderate' | 'heavy';

export interface TrafficDot {
	id: string;
	coordinate: Coordinate;
	level: TrafficLevel;
	roadName: string;
	speedKmH: number;
}

export type FloodSeverity = 'dry' | 'ankle' | 'knee' | 'waist' | 'impassable';

export interface FloodHazardZone {
	id: string;
	name: string;
	center: Coordinate;
	radiusMeters: number;
	depthCm: number;
	severity: FloodSeverity;
	affectedRoad: string;
	reportedTime: string;
	description: string;
	active: boolean;
}

export interface NavigationStep {
	progressMeters: number;
	id: string;
	instruction: string;
	cebuanoInstruction: string;
	distanceMeters: number;
	durationSeconds: number;
	maneuver:
		'straight' | 'turn-left' | 'turn-right' | 'slight-left' | 'slight-right' | 'u-turn' | 'arrive';
	coordinate: Coordinate;
	streetName: string;
	hazardAhead?: {
		depthCm: number;
		hazardName: string;
		isPassable: boolean;
	};
}

export interface RouteOption {
	source: 'osrm' | 'fixture';
	id: 'primary' | 'alternative_safe';
	name: string;
	isAlternativeSafeRoute: boolean;
	polyline: Coordinate[];
	distanceKm: number;
	durationMinutes: number;
	trafficDots: TrafficDot[];
	floodZonesEncountered: FloodHazardZone[];
	isPassable: boolean;
	maxWaterDepthCm: number;
	summary: string;
	steps: NavigationStep[];
}

export type NavigationMode = 'normal' | 'flood_alert' | 'rerouting';
