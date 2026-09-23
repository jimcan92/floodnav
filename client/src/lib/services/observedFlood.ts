import type { Coordinate } from '../types/navigation';
import type { FloodGeometry, ObservedFloodFeature, ObservedFloods } from '../types/observedFlood';

function onSegment(p: number[], a: number[], b: number[]): boolean {
	const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
	return Math.abs(cross) < 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-12 && p[0] <= Math.max(a[0], b[0]) + 1e-12 && p[1] >= Math.min(a[1], b[1]) - 1e-12 && p[1] <= Math.max(a[1], b[1]) + 1e-12;
}
function inRing(p: number[], ring: number[][]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[i], b = ring[j];
		if (onSegment(p, a, b)) return true;
		if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
	}
	return inside;
}
export function intersectsObservedFlood(path: Coordinate[], geometry: FloodGeometry): boolean {
	const points = path.map(([lat, lng]) => [lng, lat]);
	const cross = (a: number[], b: number[], c: number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
	return geometry.coordinates.some((rings) => {
		if (points.some((p) => inRing(p, rings[0]) && !rings.slice(1).some((hole) => inRing(p, hole)))) return true;
		return points.some((a, i) => i > 0 && rings.some((ring) => ring.some((c, j) => {
			if (!j) return false;
			const b = points[i-1], d = ring[j-1];
			return onSegment(a,c,d) || onSegment(b,c,d) || onSegment(c,a,b) || onSegment(d,a,b) || (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0);
		})));
	});
}
export function recentObservedFloods(data: ObservedFloods | null, now = Date.now()): ObservedFloodFeature[] {
	if (!data || data.stale || data.status !== 'available') return [];
	return data.features.filter((f) => {
		const age = now - Date.parse(f.properties.observedAt);
		return age >= 0 && age <= data.freshnessHours * 3600000;
	});
}
export function actionableObservedFloods(data: ObservedFloods | null, now = Date.now()): ObservedFloodFeature[] {
	return recentObservedFloods(data, now).filter((f) => f.properties.quality === 'high' && f.properties.minimumLikelihood >= 80 && f.properties.advisoryFlags.length === 0);
}
export function observationTime(value: string): string {
	return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', year: 'numeric' }).format(new Date(value)) + ' PHT';
}
