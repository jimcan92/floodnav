import { contours } from 'd3-contour';
import proj4 from 'proj4';
import type { Bounds, ObservedFloodFeature } from '../types/observedFlood';

export interface RasterScene {
	id: string; observedAt: string; processedAt: string | null; version: string;
	flood: Uint8Array; likelihood: Uint8Array; exclusion: Uint8Array; advisory: Uint8Array;
}
export interface RasterGrid {
	width: number; height: number; x: number; y: number; resolution: number; projection: string;
}
// Native 20 m cells: no averaging of binary flood classes and no maximum-over-time union.
export async function compositeScenes(scenes: RasterScene[] | ((needsPixels: (flood: Uint8Array) => boolean) => AsyncIterable<RasterScene>), grid: RasterGrid, bounds: Bounds, now: number, freshnessHours: number) {
	const size = grid.width * grid.height;
	const owner = new Int16Array(size).fill(-1);
	const state = new Uint8Array(size); // 0 unknown, 1 excluded, 2 nonflood, 3 flood caution, 4 flood high
	const project = proj4(grid.projection, 'EPSG:4326');
	let totalPixels = 0;
	const inside = new Uint8Array(size);
	// Clip in projected space by transforming the geographic boundary densely once.
	const inverse = proj4('EPSG:4326', grid.projection);
	const boundary: number[][] = [];
	for (let edge = 0; edge < 4; edge++) for (let i = 0; i < 64; i++) {
		const t = i / 64;
		const p = edge === 0 ? [bounds[0] + t*(bounds[2]-bounds[0]),bounds[1]] : edge === 1 ? [bounds[2],bounds[1]+t*(bounds[3]-bounds[1])] : edge === 2 ? [bounds[2]-t*(bounds[2]-bounds[0]),bounds[3]] : [bounds[0],bounds[3]-t*(bounds[3]-bounds[1])];
		boundary.push(inverse.forward(p));
	}
	// Scanline rasterization of the boundary avoids millions of projection calls.
	for (let row = 0; row < grid.height; row++) {
		const y = grid.y - (row + 0.5)*grid.resolution;
		const xs: number[] = [];
		for (let i = 0, j = boundary.length-1; i < boundary.length; j=i++) {
			const a=boundary[i], b=boundary[j];
			if ((a[1]>y)!==(b[1]>y)) xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
		}
		xs.sort((a,b)=>a-b);
		for (let i=0;i+1<xs.length;i+=2) for(let col=Math.max(0,Math.ceil((xs[i]-grid.x)/grid.resolution-0.5));col<grid.width && grid.x+(col+0.5)*grid.resolution<xs[i+1];col++) { inside[row*grid.width+col]=1; totalPixels++; }
	}
	const ordered: Omit<RasterScene, 'flood' | 'likelihood' | 'exclusion' | 'advisory'>[] = [];
	const likelihood = new Uint8Array(size), advisory = new Uint8Array(size);
	const observations: {productId:string;observedAt:string;processedAt:string|null;version:string;coveredPixels:number}[]=[];
	const source = Array.isArray(scenes) ? [...scenes].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)) : scenes((flood)=>flood.some((value,i)=>inside[i]===1&&owner[i]===-1&&value!==255));
	let assigned=0;
	for await (const scene of source) {
		const s = ordered.length;
		if (s && Date.parse(scene.observedAt) > Date.parse(ordered[s-1].observedAt)) throw new Error('GFM scenes must be newest first');
		ordered.push({id:scene.id,observedAt:scene.observedAt,processedAt:scene.processedAt,version:scene.version});
		observations.push({productId:scene.id,observedAt:scene.observedAt,processedAt:scene.processedAt,version:scene.version,coveredPixels:0});
		if ([scene.flood,scene.likelihood,scene.exclusion,scene.advisory].some((a)=>a.length!==size)) throw new Error('Mismatched GFM raster window');
		for(let i=0;i<size;i++) {
			if(!inside[i] || owner[i]!==-1 || scene.flood[i]===255) continue;
			owner[i]=s; assigned++;
			likelihood[i]=scene.likelihood[i]; advisory[i]=scene.advisory[i];
			observations[s].coveredPixels++;
			if(scene.exclusion[i]!==0 || ![0,1].includes(scene.flood[i])) state[i]=scene.exclusion[i]===1?1:0;
			else if(scene.flood[i]===0) state[i]=2;
			else state[i]=scene.likelihood[i]>=80 && scene.likelihood[i]<=100 && scene.advisory[i]===0 ? 4:3;
		}
		if(assigned===totalPixels) break;
	}
	const coverage={observedPixels:0,unknownPixels:0,excludedPixels:0,recentPixels:0,totalPixels};
	for(let i=0;i<size;i++) if(inside[i]) {
		if(state[i]<2) { coverage.unknownPixels++; if(state[i]===1) coverage.excludedPixels++; }
		else { coverage.observedPixels++; const age=now-Date.parse(ordered[owner[i]].observedAt); if(age>=0 && age<=freshnessHours*3600000) coverage.recentPixels++; }
	}
	const features: ObservedFloodFeature[]=[];
	for(let s=0;s<ordered.length;s++) for(const quality of [3,4]) {
		const mask=new Uint8Array(size);
		let count=0, minimumLikelihood=100;
		const flags=new Set<number>();
		for(let i=0;i<size;i++) if(owner[i]===s && state[i]===quality) { mask[i]=1; count++; minimumLikelihood=Math.min(minimumLikelihood,likelihood[i]<=100?likelihood[i]:0); if(advisory[i]!==0) flags.add(advisory[i]); }
		if(!count) continue;
		const contour=contours().size([grid.width,grid.height]).smooth(false).thresholds([0.5])(mask as unknown as number[])[0];
		const coordinates=contour.coordinates.map((polygon)=>polygon.map((ring)=>ring.map(([x,y])=>project.forward([grid.x+x*grid.resolution,grid.y-y*grid.resolution]))));
		features.push({type:'Feature',geometry:{type:'MultiPolygon',coordinates},properties:{productId:ordered[s].id,observedAt:ordered[s].observedAt,processedAt:ordered[s].processedAt,version:ordered[s].version,quality:quality===4?'high':'caution',minimumLikelihood,advisoryFlags:[...flags]}});
	}
	return {features,coverage,observations:observations.filter((s)=>s.coveredPixels>0)};
}
