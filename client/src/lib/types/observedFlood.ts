/** Satellite observations are separate from susceptibility and simulated water depths. */
export type Bounds = [west: number, south: number, east: number, north: number];
export type FloodGeometry = { type: 'MultiPolygon'; coordinates: number[][][][] };
export interface ObservedFloodFeature {
	type: 'Feature';
	geometry: FloodGeometry;
	properties: {
		productId: string;
		observedAt: string;
		processedAt: string | null;
		version: string;
		quality: 'high' | 'caution';
		minimumLikelihood: number;
		advisoryFlags: number[];
	};
}
export interface ObservedFloods {
	bounds: Bounds;
	status: 'available' | 'unavailable' | 'unsupported';
	stale: boolean;
	message: string;
	fetchedAt: string | null;
	freshnessHours: number;
	features: ObservedFloodFeature[];
	coverage: { observedPixels: number; unknownPixels: number; excludedPixels: number; recentPixels: number; totalPixels: number };
	observations: { productId: string; observedAt: string; processedAt: string | null; version: string; coveredPixels: number }[];
	attribution: string;
}
export const CEBU_BOUNDS: Bounds = [123.75, 10.15, 124.10, 10.55];
