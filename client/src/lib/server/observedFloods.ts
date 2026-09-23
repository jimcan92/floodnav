import { fromUrl } from 'geotiff';
import proj4 from 'proj4';
import { CEBU_BOUNDS, type Bounds, type ObservedFloods } from '../types/observedFlood';
import { compositeScenes, type RasterGrid, type RasterScene } from './gfmRaster';

const CATALOG='https://stac.eodc.eu/api/v1';
const TTL=30*60*1000;
const attribution='Contains modified Copernicus Emergency Management Service information (2026), Global Flood Monitoring, European Union.';
interface Item { id:string; properties:Record<string, unknown>; assets:Record<string,{href:string}> }

export function parseBounds(value: unknown): Bounds {
	if(!Array.isArray(value)||value.length!==4||!value.every((n)=>typeof n==='number'&&Number.isFinite(n))||value[0]>=value[2]||value[1]>=value[3]||Math.abs(value[0])>180||Math.abs(value[2])>180||Math.abs(value[1])>90||Math.abs(value[3])>90) throw new Error('Provide valid [west, south, east, north] bounds.');
	return value as Bounds;
}
function empty(status:ObservedFloods['status'],message:string,freshnessHours:number):ObservedFloods {
	return {bounds:CEBU_BOUNDS,status,stale:false,message,fetchedAt:null,freshnessHours,features:[],coverage:{observedPixels:0,unknownPixels:0,excludedPixels:0,recentPixels:0,totalPixels:0},observations:[],attribution};
}
function safeAsset(item:Item,key:string) {
	const url=new URL(item.assets[key]?.href || 'https://invalid/');
	if(url.origin!=='https://data.eodc.eu'||!url.pathname.startsWith('/collections/')||!url.pathname.endsWith('.tif')) throw new Error('GFM raster asset unavailable');
	return url.href;
}
async function search(now:number,signal:AbortSignal):Promise<Item[]> {
	let url:string|null=`${CATALOG}/search?${new URLSearchParams({collections:'GFM',bbox:CEBU_BOUNDS.join(','),datetime:`${new Date(now-14*86400000).toISOString()}/${new Date(now).toISOString()}`,limit:'100',sortby:'-datetime'})}`;
	const items:Item[]=[];
	for(let page=0;url && page<4;page++) {
		if(!url.startsWith(CATALOG+'/')) throw new Error('Invalid catalogue pagination');
		const response:Response=await fetch(url,{signal});
		if(!response.ok) throw new Error('GFM catalogue unavailable');
		const data:{features:Item[];links?:{rel:string;href:string}[]}=await response.json();
		if(!Array.isArray(data.features)) throw new Error('Invalid GFM catalogue');
		items.push(...data.features);
		const next=data.links?.find((l:{rel:string})=>l.rel==='next');
		url=next?.href ? new URL(next.href,CATALOG+'/').href:null;
	}
	if(url||items.length>40) throw new Error('GFM processing limit reached');
	return items.filter((i)=>Number.isFinite(Date.parse(String(i.properties.datetime)))).sort((a,b)=>Date.parse(String(b.properties.datetime))-Date.parse(String(a.properties.datetime)));
}
function gridFor(item:Item): {grid:RasterGrid;window:number[];shape:number[];transform:number[]} {
	const p=item.properties, projection=String(p['proj:wkt2']||''), transform=p['proj:transform'] as number[], shape=p['proj:shape'] as number[];
	if(!projection||!Array.isArray(transform)||transform.length!==6||transform[0]!==20||transform[4]!==-20||transform[1]!==0||transform[3]!==0||!Array.isArray(shape)||shape.length!==2) throw new Error('Unsupported GFM raster grid');
	const project=proj4('EPSG:4326',projection);
	const points:number[][]=[];
	for(let i=0;i<=32;i++) {
		const x=CEBU_BOUNDS[0]+(CEBU_BOUNDS[2]-CEBU_BOUNDS[0])*i/32, y=CEBU_BOUNDS[1]+(CEBU_BOUNDS[3]-CEBU_BOUNDS[1])*i/32;
		for(const p of [[x,CEBU_BOUNDS[1]],[x,CEBU_BOUNDS[3]],[CEBU_BOUNDS[0],y],[CEBU_BOUNDS[2],y]]) points.push(project.forward(p));
	}
	const x0=Math.max(0,Math.floor((Math.min(...points.map((p)=>p[0]))-transform[2])/20));
	const x1=Math.min(shape[1],Math.ceil((Math.max(...points.map((p)=>p[0]))-transform[2])/20));
	const y0=Math.max(0,Math.floor((transform[5]-Math.max(...points.map((p)=>p[1])))/20));
	const y1=Math.min(shape[0],Math.ceil((transform[5]-Math.min(...points.map((p)=>p[1])))/20));
	if(x1<=x0||y1<=y0||(x1-x0)*(y1-y0)>8_000_000) throw new Error('Unsupported GFM raster window');
	return {grid:{width:x1-x0,height:y1-y0,x:transform[2]+x0*20,y:transform[5]-y0*20,resolution:20,projection},window:[x0,y0,x1,y1],shape,transform};
}
async function load(now:number,freshnessHours:number):Promise<ObservedFloods> {
	const signal=AbortSignal.timeout(180000);
	const items=await search(now,signal);
	const output=empty('available',items.length?'Satellite observations are dated; unobserved and excluded areas remain unknown.':'No satellite observations in the last 14 days. Conditions remain unknown.',freshnessHours);
	const groups=new Map<string,Item[]>();
	for(const item of items) { const key=String(item.properties.Equi7Tile); groups.set(key,[...(groups.get(key)||[]),item]); }
	for(const group of groups.values()) {
		const info=gridFor(group[0]);
		async function* scenes(needsPixels:(flood:Uint8Array)=>boolean): AsyncGenerator<RasterScene> {
		for(const item of group) {
			signal.throwIfAborted();
			const current=gridFor(item);
			if(JSON.stringify(current)!==JSON.stringify(info)) throw new Error('Inconsistent GFM tile alignment');
			async function band(name:string):Promise<Uint8Array> {
				const options={allowFullFile:false,blockSize:65536,cacheSize:16};
				const tiff=await fromUrl(safeAsset(item,name),options,signal);
				const image=await tiff.getImage();
				const origin=image.getOrigin(),resolution=image.getResolution();
				if(image.getWidth()!==info.shape[1]||image.getHeight()!==info.shape[0]||origin[0]!==info.transform[2]||origin[1]!==info.transform[5]||resolution[0]!==20||resolution[1]!==-20||image.getGDALNoData()!==255) throw new Error('Unexpected GFM raster metadata');
				const raster=await image.readRasters({window:info.window,samples:[0],interleave:true,signal});
				if(!(raster instanceof Uint8Array)) throw new Error('Unsupported GFM raster class encoding');
				return raster;
			}
			const flood=await band('ensemble_flood_extent');
			if(!needsPixels(flood)) continue;
			const quality=await Promise.allSettled(['ensemble_likelihood','exclusion_mask','advisory_flags'].map(band));
			const bands=[flood,...quality.map((result)=>{if(result.status==='rejected') throw result.reason;return result.value;})];
			yield {id:item.id,observedAt:String(item.properties.datetime),processedAt:item.properties['processing:datetime']?String(item.properties['processing:datetime']):null,version:String(item.properties['processing:version']||'unknown'),flood:bands[0],likelihood:bands[1],exclusion:bands[2],advisory:bands[3]};
		}
		}
		const result=await compositeScenes(scenes,info.grid,CEBU_BOUNDS,now,freshnessHours);
		output.features.push(...result.features);
		output.observations.push(...result.observations);
		for(const key of Object.keys(output.coverage) as (keyof ObservedFloods['coverage'])[]) output.coverage[key]+=result.coverage[key];
	}
	output.fetchedAt=new Date().toISOString();
	return output;
}
export function createObservedFloodProvider(loader:typeof load=load, currentTime=Date.now) {
 let cached:ObservedFloods|null=null;
 let pending:Promise<ObservedFloods>|null=null;
 let nextAttempt=0;
 return async function getObservedFloods(bounds:Bounds,freshnessHours=24):Promise<ObservedFloods> {
	if(bounds[2]<CEBU_BOUNDS[0]||bounds[0]>CEBU_BOUNDS[2]||bounds[3]<CEBU_BOUNDS[1]||bounds[1]>CEBU_BOUNDS[3]) return empty('unsupported','Satellite flood coverage is currently limited to Metro Cebu.',freshnessHours);
	const now=currentTime();
	if(cached && now<nextAttempt) return cached;
	if(!pending) pending=loader(now,freshnessHours).then((result)=>{cached=result;nextAttempt=currentTime()+TTL;return result;}).catch((error)=>{
		console.warn('GFM observations unavailable:', error instanceof Error ? error.message : 'Provider error');
		cached=cached?.fetchedAt ? {...cached,stale:true,message:'Satellite provider unavailable. Showing the last successful observations with their original dates.'}:empty('unavailable','Satellite provider unavailable. Flood conditions remain unknown.',freshnessHours);
		nextAttempt=currentTime()+60000;
		return cached;
	}).finally(()=>{pending=null;});
	return pending;
}

}
export const getObservedFloods=createObservedFloodProvider();
