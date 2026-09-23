import { describe, expect, test, vi } from 'vitest';
import { compositeScenes, type RasterScene, type RasterGrid } from '../client/src/lib/server/gfmRaster';
import { parseBounds } from '../client/src/lib/server/observedFloods';
import { actionableObservedFloods, intersectsObservedFlood, recentObservedFloods } from '../client/src/lib/services/observedFlood';
import { CEBU_BOUNDS, type ObservedFloods, type FloodGeometry } from '../client/src/lib/types/observedFlood';
const now=Date.parse('2026-09-23T00:00:00Z');
const grid:RasterGrid={width:3,height:3,x:123.89,y:10.32,resolution:0.001,projection:'EPSG:4326'};
const bounds:[number,number,number,number]=[123.89,10.317,123.893,10.32];
function scene(flood:number[], overrides:Partial<RasterScene>={}):RasterScene {return {id:'latest',observedAt:'2026-09-22T23:00:00Z',processedAt:null,version:'test',flood:Uint8Array.from(flood),exclusion:new Uint8Array(9),likelihood:new Uint8Array(9).fill(90),advisory:new Uint8Array(9),...overrides};}
function response(features:ObservedFloods['features']):ObservedFloods {return {bounds:CEBU_BOUNDS,status:'available',stale:false,message:'',freshnessHours:24,fetchedAt:new Date(now).toISOString(),features,coverage:{totalPixels:9,observedPixels:9,unknownPixels:0,excludedPixels:0,recentPixels:9},observations:[],attribution:'Copernicus'};}
describe('GFM native raster compositing',()=>{
 test('newer valid nonflood clears older flooding while uncovered pixels retain original dates',async()=>{
  const old=scene(new Array(9).fill(1),{id:'old',observedAt:'2026-09-20T00:00:00Z'});
  const fresh=scene([0,255,0,0,0,0,0,0,0]);
  const result=await compositeScenes([old,fresh],grid,bounds,now,24);
  expect(result.features).toHaveLength(1);expect(result.features[0].properties.productId).toBe('old');
  expect(result.coverage.recentPixels).toBe(8);expect(result.coverage.observedPixels).toBe(9);
  expect(actionableObservedFloods(response(result.features),now)).toEqual([]);
 });
 test('exclusion masks prevent clear/no-flood claims and supersede older flood pixels',async()=>{
  const old=scene(new Array(9).fill(1),{id:'old',observedAt:'2026-09-20T00:00:00Z'});
  const fresh=scene(new Array(9).fill(0),{exclusion:Uint8Array.from([1,255,0,0,0,0,0,0,0])});
  const result=await compositeScenes([fresh,old],grid,bounds,now,24);
  expect(result.features).toEqual([]);expect(result.coverage.unknownPixels).toBe(2);expect(result.coverage.observedPixels).toBe(7);
 });
 test('no-data is unknown, not a satellite declaration of no flooding',async()=>{
  const result=await compositeScenes([scene(new Array(9).fill(255))],grid,bounds,now,24);
  expect(result.coverage.unknownPixels).toBe(9);expect(result.observations).toEqual([]);expect(result.features).toEqual([]);
 });
 test('quality flags and invalid likelihood disqualify optional routing avoidance',async()=>{
  const result=await compositeScenes([scene([1,1,1,0,0,0,0,0,0],{likelihood:Uint8Array.from([80,79,255,0,0,0,0,0,0]),advisory:Uint8Array.from([0,1,255,0,0,0,0,0,0])})],grid,bounds,now,24);
  expect(result.features).toHaveLength(2);expect(actionableObservedFloods(response(result.features),now)).toHaveLength(1);
  expect(recentObservedFloods(response(result.features),now)).toHaveLength(2);
  expect(actionableObservedFloods({...response(result.features),stale:true},now)).toEqual([]);
 });
 test('contours retain holes and project cell boundaries into WGS84',async()=>{
  const result=await compositeScenes([scene([1,1,1,1,0,1,1,1,1])],grid,bounds,now,24);
  expect(result.features[0].geometry.coordinates[0]).toHaveLength(2);
  expect(intersectsObservedFlood([[10.3185,123.8915]],result.features[0].geometry)).toBe(false);
  expect(intersectsObservedFlood([[10.3195,123.8905]],result.features[0].geometry)).toBe(true);
 });
 test('permanent/reference water is not manufactured into flood from high likelihood alone',async()=>{
  const result=await compositeScenes([scene(new Array(9).fill(0))],grid,bounds,now,24);
  expect(result.features).toEqual([]);
 });
 test('rejects mismatched rasters',async()=>{
  await expect(compositeScenes([scene([1])],grid,bounds,now,24)).rejects.toThrow('Mismatched');
 });
});
describe('route geometry and bounds',()=>{
 const polygon:FloodGeometry={type:'MultiPolygon',coordinates:[[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]]]};
 test('checks full segments, boundaries and holes',()=>{
  expect(intersectsObservedFlood([[2,-1],[2,5]],polygon)).toBe(true);
  expect(intersectsObservedFlood([[2,1.5],[2,2.5]],polygon)).toBe(false);
  expect(intersectsObservedFlood([[0,-1],[0,5]],polygon)).toBe(true);
  expect(intersectsObservedFlood([[5,-1],[5,5]],polygon)).toBe(false);
 });
 test('validates bounding boxes before provider access',()=>{
  expect(parseBounds(CEBU_BOUNDS)).toEqual(CEBU_BOUNDS);
  for(const b of [null,[0,0,0,0],[0,0,Infinity,2],[200,0,201,1],['1',2,3,4]]) expect(()=>parseBounds(b)).toThrow();
 });
});

describe('satellite cache lifecycle',()=>{
 test('deduplicates requests, retains original timestamps on failures, and recovers',async()=>{
  const {createObservedFloodProvider}=await import('../client/src/lib/server/observedFloods');
  let clock=now;
  const initial=response([]);
  const loader=vi.fn().mockResolvedValue(initial);
  const provider=createObservedFloodProvider(loader,()=>clock);
  const [a,b]=await Promise.all([provider(CEBU_BOUNDS),provider(CEBU_BOUNDS)]);
  expect(a).toEqual(b);expect(loader).toHaveBeenCalledTimes(1);
  clock+=29*60000;await provider(CEBU_BOUNDS);expect(loader).toHaveBeenCalledTimes(1);
  clock+=2*60000;loader.mockRejectedValue(new Error('Provider timeout'));
  const stale=await provider(CEBU_BOUNDS);expect(stale.stale).toBe(true);expect(stale.fetchedAt).toBe(initial.fetchedAt);
  expect(actionableObservedFloods(stale,clock)).toEqual([]);
  await provider(CEBU_BOUNDS);expect(loader).toHaveBeenCalledTimes(2);
  clock+=60001;loader.mockResolvedValue({...initial,fetchedAt:new Date(clock).toISOString()});
  expect((await provider(CEBU_BOUNDS)).stale).toBe(false);
  expect(loader).toHaveBeenCalledTimes(3);
 });
 test('outside Cebu does not request or claim flood-free coverage',async()=>{
  const {createObservedFloodProvider}=await import('../client/src/lib/server/observedFloods');
  const loader=vi.fn();const data=await createObservedFloodProvider(loader)([120,14,121,15]);
  expect(data.status).toBe('unsupported');expect(data.coverage.observedPixels).toBe(0);expect(loader).not.toHaveBeenCalled();
 });
 test('native meter-grid reprojection yields geographic coordinates',async()=>{
  const meters:RasterGrid={width:3,height:3,x:0,y:60,resolution:20,projection:'EPSG:3857'};
  const data=await compositeScenes([scene(new Array(9).fill(1))],meters,[-0.001,-0.001,0.001,0.001],now,24);
  expect(data.coverage.totalPixels).toBe(9);
  const points=data.features[0].geometry.coordinates.flat(2);
  expect(Math.max(...points.map(p=>p[0]))).toBeCloseTo(0.000538989,8);
  expect(Math.max(...points.map(p=>p[1]))).toBeCloseTo(0.000538989,8);
 });
});
