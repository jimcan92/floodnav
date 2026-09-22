import type { Coordinate } from '../types/navigation';
import type {
	AssessmentRoad,
	ExposureSegment,
	ForecastInterval,
	HazardData,
	HazardFeature,
	RouteExposure,
	Susceptibility,
	WeatherData,
	WeatherSample
} from '../types/rainfall';

export const MODEL = {
	version: 'experimental-exposure-v1',
	gridDegrees: 0.02,
	weights: { LF: 1, MF: 2, HF: 3, VHF: 4 },
	rainfallScaleMmH: 10,
	minimumImprovement: 0.1
} as const;
export const LOGGING_KEY = 'floodnav.researchLogging';
export function loadLoggingPreference(storage: Pick<Storage, 'getItem'>): boolean {
	try {
		return storage.getItem(LOGGING_KEY) !== 'false';
	} catch {
		return true;
	}
}
export function gridCell(p: Coordinate): string {
	return `${Math.floor((p[0] + 1e-10) / MODEL.gridDegrees)}:${Math.floor((p[1] + 1e-10) / MODEL.gridDegrees)}`;
}
export function cellCenter(cell: string): Coordinate {
	const [y, x] = cell.split(':').map(Number);
	return [(y + 0.5) * MODEL.gridDegrees, (x + 0.5) * MODEL.gridDegrees];
}
export function distanceKm(a: Coordinate, b: Coordinate): number {
	const r = Math.PI / 180;
	const h =
		Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
		Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
	return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}
const interpolate = (a: Coordinate, b: Coordinate, t: number): Coordinate => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t
];
const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];
function rings(f: HazardFeature): number[][][] {
	return f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
}
function inRing(p: number[], ring: number[][]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[j],
			b = ring[i];
		const area = cross([b[0] - a[0], b[1] - a[1]], [p[0] - a[0], p[1] - a[1]]);
		if (
			Math.abs(area) < 1e-12 &&
			p[0] >= Math.min(a[0], b[0]) - 1e-12 &&
			p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
			p[1] >= Math.min(a[1], b[1]) - 1e-12 &&
			p[1] <= Math.max(a[1], b[1]) + 1e-12
		)
			return true;
		if (
			a[1] > p[1] !== b[1] > p[1] &&
			p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
		)
			inside = !inside;
	}
	return inside;
}
export function contains(f: HazardFeature, p: Coordinate): boolean {
	const point = [p[1], p[0]];
	const polygons =
		f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
	return polygons.some(
		(polygon) => inRing(point, polygon[0]) && !polygon.slice(1).some((hole) => inRing(point, hole))
	);
}
function split(a: Coordinate, b: Coordinate, features: HazardFeature[]): number[] {
	const ts = [0, 1];
	for (const axis of [0, 1]) {
		if (Math.abs(b[axis] - a[axis]) < 1e-12) continue;
		for (
			let n = Math.floor(Math.min(a[axis], b[axis]) / 0.02) + 1;
			n * 0.02 < Math.max(a[axis], b[axis]);
			n++
		)
			ts.push((n * 0.02 - a[axis]) / (b[axis] - a[axis]));
	}
	const p = [a[1], a[0]],
		d = [b[1] - a[1], b[0] - a[0]];
	for (const f of features)
		for (const ring of rings(f))
			for (let i = 1; i < ring.length; i++) {
				const q = ring[i - 1],
					edge = [ring[i][0] - q[0], ring[i][1] - q[1]],
					delta = [q[0] - p[0], q[1] - p[1]];
				const denominator = cross(d, edge);
				if (Math.abs(denominator) > 1e-15) {
					const t = cross(delta, edge) / denominator,
						u = cross(delta, d) / denominator;
					if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
				} else if (Math.abs(cross(delta, d)) < 1e-15) {
					const axis = Math.abs(d[0]) > Math.abs(d[1]) ? 0 : 1;
					if (Math.abs(d[axis]) > 1e-15)
						for (const q2 of [q, ring[i]]) {
							const t = (q2[axis] - p[axis]) / d[axis];
							if (t > 0 && t < 1) ts.push(t);
						}
				}
			}
	return ts.sort((x, y) => x - y).filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-9);
}
export function routeCells(roads: AssessmentRoad[]): string[] {
	const cells = new Set<string>();
	for (const road of roads)
		for (let i = 1; i < road.polyline.length; i++) {
			const a = road.polyline[i - 1],
				b = road.polyline[i],
				ts = split(a, b, []);
			for (let j = 1; j < ts.length; j++)
				cells.add(gridCell(interpolate(a, b, (ts[j - 1] + ts[j]) / 2)));
		}
	return [...cells].sort();
}
export function nextForecast(
	forecast: ForecastInterval[],
	now: number
): ForecastInterval | undefined {
	return forecast.find(
		(f) => Date.parse(f.endsAt) > now && Date.parse(f.endsAt) <= now + 3 * 3600000
	);
}
export function sampleRate(sample: WeatherSample | undefined, now: number): number | null {
	if (
		!sample ||
		!Number.isFinite(Date.parse(sample.observedAt)) ||
		!Number.isFinite(Date.parse(sample.forecastFetchedAt)) ||
		!Number.isFinite(sample.rainMmH) ||
		sample.rainMmH < 0 ||
		now - Date.parse(sample.observedAt) > 30 * 60000 ||
		Date.parse(sample.observedAt) > now + 300000 ||
		Date.parse(sample.forecastFetchedAt) > now + 300000 ||
		now - Date.parse(sample.forecastFetchedAt) >= 3600000
	)
		return null;
	const forecast = nextForecast(sample.forecast, now);
	return forecast ? Math.max(sample.rainMmH, forecast.rainMm3h / 3) : null;
}
export function assessRoutes(
	roads: AssessmentRoad[],
	weather: WeatherData,
	hazards: HazardData,
	now = Date.now()
): { routes: RouteExposure[]; recommendedKey: string | null } {
	const samples = new Map(weather.samples.map((s) => [s.cell, s]));
	const features = hazards.features.map((feature) => {
		const bounds = [Infinity, Infinity, -Infinity, -Infinity];
		for (const ring of rings(feature))
			for (const p of ring) {
				bounds[0] = Math.min(bounds[0], p[0]);
				bounds[1] = Math.min(bounds[1], p[1]);
				bounds[2] = Math.max(bounds[2], p[0]);
				bounds[3] = Math.max(bounds[3], p[1]);
			}
		return { feature, bounds };
	});
	const routes = roads.map((road): RouteExposure => {
		const segments: ExposureSegment[] = [];
		const distanceByClass = { LF: 0, MF: 0, HF: 0, VHF: 0, unclassified: 0 };
		const reasons = new Set<string>();
		if (!hazards.verified || hazards.error)
			reasons.add(hazards.error || 'MGB coverage and reuse verification is pending.');
		for (let i = 1; i < road.polyline.length; i++) {
			const a = road.polyline[i - 1],
				b = road.polyline[i];
			// Bounding-box rejection avoids testing every polygon against every road edge.
			const nearby = features
				.filter(
					({ bounds: box }) =>
						box[0] <= Math.max(a[1], b[1]) &&
						box[2] >= Math.min(a[1], b[1]) &&
						box[1] <= Math.max(a[0], b[0]) &&
						box[3] >= Math.min(a[0], b[0])
				)
				.map(({ feature }) => feature);
			const ts = split(a, b, nearby);
			for (let j = 1; j < ts.length; j++) {
				const from = interpolate(a, b, ts[j - 1]),
					to = interpolate(a, b, ts[j]),
					middle = interpolate(a, b, (ts[j - 1] + ts[j]) / 2);
				const lengthKm = distanceKm(from, to);
				if (lengthKm < 1e-9) continue;
				const cell = gridCell(middle);
				const susceptibility =
					nearby
						.filter((f) => contains(f, middle))
						.map((f) => f.properties.susceptibility)
						.sort((x, y) => MODEL.weights[y] - MODEL.weights[x])[0] || null;
				const rainMmH = sampleRate(samples.get(cell), now);
				if (!susceptibility) reasons.add('Unclassified MGB route sections.');
				if (rainMmH === null) reasons.add('Weather missing, stale, or forecast unavailable.');
				distanceByClass[susceptibility || 'unclassified'] += lengthKm;
				segments.push({
					from,
					to,
					lengthKm,
					cell,
					susceptibility,
					rainMmH,
					contribution:
						susceptibility && rainMmH !== null
							? lengthKm * MODEL.weights[susceptibility] * (1 + rainMmH / MODEL.rainfallScaleMmH)
							: null
				});
			}
		}
		const length = segments.reduce((sum, s) => sum + s.lengthKm, 0);
		if (!length) reasons.add('Empty route geometry.');
		return {
			key: road.key,
			score: reasons.size ? null : segments.reduce((sum, s) => sum + (s.contribution || 0), 0),
			coverage: length
				? segments.filter((s) => s.contribution !== null).reduce((sum, s) => sum + s.lengthKm, 0) /
					length
				: 0,
			distanceByClass,
			segments,
			reasons: [...reasons]
		};
	});
	let recommendedKey: string | null = null;
	if (routes.length > 1 && routes.every((r) => r.score !== null)) {
		const primaryScore = routes[0].score!;
		const candidates = routes
			.slice(1)
			.filter(
				(r, i) =>
					JSON.stringify(roads[i + 1].polyline) !== JSON.stringify(roads[0].polyline) &&
					r.score! <= primaryScore * (1 - MODEL.minimumImprovement)
			);
		candidates.sort(
			(a, b) =>
				a.score! - b.score! ||
				roads.find((r) => r.key === a.key)!.durationSeconds -
					roads.find((r) => r.key === b.key)!.durationSeconds ||
				roads.find((r) => r.key === a.key)!.distanceMeters -
					roads.find((r) => r.key === b.key)!.distanceMeters
		);
		recommendedKey = candidates[0]?.key || null;
	}
	return { routes, recommendedKey };
}
