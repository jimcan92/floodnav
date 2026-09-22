import type { Coordinate } from './navigation';

export type Susceptibility = 'LF' | 'MF' | 'HF' | 'VHF';
export interface HazardFeature {
	type: 'Feature';
	properties: { id: string; susceptibility: Susceptibility };
	geometry:
		| { type: 'Polygon'; coordinates: number[][][] }
		| { type: 'MultiPolygon'; coordinates: number[][][][] };
}
export interface ForecastInterval {
	endsAt: string;
	rainMm3h: number;
	probability: number;
}
export interface WeatherSample {
	cell: string;
	coordinate: Coordinate;
	returnedCoordinate: Coordinate;
	observedAt: string;
	fetchedAt: string;
	forecastFetchedAt: string;
	rainMmH: number;
	forecast: ForecastInterval[];
}
export interface WeatherData {
	samples: WeatherSample[];
	errors: string[];
}
export interface HazardData {
	features: HazardFeature[];
	source: string;
	fetchedAt: string;
	verified: boolean;
	error?: string;
}
export interface AssessmentRoad {
	key: string;
	polyline: Coordinate[];
	distanceMeters: number;
	durationSeconds: number;
}
export interface ExposureSegment {
	from: Coordinate;
	to: Coordinate;
	lengthKm: number;
	cell: string;
	susceptibility: Susceptibility | null;
	rainMmH: number | null;
	contribution: number | null;
}
export interface RouteExposure {
	key: string;
	score: number | null;
	coverage: number;
	distanceByClass: Record<Susceptibility | 'unclassified', number>;
	segments: ExposureSegment[];
	reasons: string[];
}
export interface ExposureAssessment {
	assessmentId: string;
	assessedAt: string;
	modelVersion: string;
	routes: RouteExposure[];
	recommendedKey: string | null;
	weather: WeatherData;
	hazards: HazardData;
	loggingStatus: 'disabled' | 'saved' | 'failed';
}
