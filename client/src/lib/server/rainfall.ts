import { createHash } from 'node:crypto';
import { MODEL, assessRoutes, cellCenter, routeCells } from '../services/rainfallAssessment';
import type {
	AssessmentRoad,
	ExposureAssessment,
	HazardData,
	HazardFeature,
	Susceptibility,
	WeatherData,
	WeatherSample
} from '../types/rainfall';

export const MGB_SOURCE =
	'https://controlmap.mgb.gov.ph/arcgis/rest/services/GeospatialDataInventory_Public/GDI_Detailed_Flood_Susceptibility_Public/MapServer/0';
type Environment = Record<string, string | undefined>;
type Snapshot = { id: string; kind: 'weather' | 'hazard'; payload: unknown };
type ProviderResult<T> = { data: T; snapshots: Snapshot[] };
type AssessmentBatch = {
	fingerprint: string;
	expires: number;
	result: ExposureAssessment;
	snapshots: Snapshot[];
};
export class InputError extends Error {}
export const hash = (data: unknown): string =>
	createHash('sha256').update(JSON.stringify(data)).digest('hex');
const snapshot = (kind: Snapshot['kind'], payload: unknown): Snapshot => ({
	id: hash({ kind, payload }),
	kind,
	payload
});

export function parseRoads(body: unknown): AssessmentRoad[] {
	const roads = (body as { roads?: unknown })?.roads;
	if (!Array.isArray(roads) || !roads.length || roads.length > 6)
		throw new InputError('Provide 1–6 road routes.');
	let points = 0;
	const keys = new Set<string>();
	return roads.map((raw) => {
		const r = raw as AssessmentRoad;
		if (
			!r ||
			typeof r.key !== 'string' ||
			!/^[\w-]{1,80}$/.test(r.key) ||
			keys.has(r.key) ||
			!Array.isArray(r.polyline) ||
			r.polyline.length < 2 ||
			!Number.isFinite(r.distanceMeters) ||
			r.distanceMeters <= 0 ||
			r.distanceMeters > 250000 ||
			!Number.isFinite(r.durationSeconds) ||
			r.durationSeconds < 0 ||
			r.durationSeconds > 86400
		)
			throw new InputError('Invalid road route.');
		keys.add(r.key);
		points += r.polyline.length;
		if (points > 15000) throw new InputError('Too many route coordinates.');
		for (const p of r.polyline)
			if (
				!Array.isArray(p) ||
				p.length !== 2 ||
				!p.every(Number.isFinite) ||
				p[0] < 9.9 ||
				p[0] > 10.7 ||
				p[1] < 123.45 ||
				p[1] > 124.15
			)
				throw new InputError('Assessment is limited to the Metro Cebu study envelope.');
		return {
			key: r.key,
			polyline: r.polyline,
			distanceMeters: r.distanceMeters,
			durationSeconds: r.durationSeconds
		};
	});
}

function number(value: unknown, max = 10000): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)
		throw new Error('Invalid provider numeric data.');
	return value;
}
function timestamp(value: unknown): string {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100000000000)
		throw new Error('Invalid provider timestamp.');
	return new Date(value * 1000).toISOString();
}
function rain(raw: Record<string, any>, field: '1h' | '3h'): number {
	if (raw.rain === undefined) {
		if (
			!Array.isArray(raw.weather) ||
			!raw.weather.length ||
			raw.weather.some(
				(w: { id?: number }) => !Number.isFinite(w.id) || (w.id! >= 200 && w.id! < 600)
			)
		)
			throw new Error('Rain amount missing for a wet or unknown weather condition.');
		return 0;
	}
	return number(raw.rain?.[field]);
}
export function parseWeather(
	current: Record<string, any>,
	forecast: Record<string, any>,
	cell: string,
	fetchedAt: string,
	forecastFetchedAt: string
): WeatherSample {
	if (
		!current?.coord ||
		!Number.isFinite(current.coord.lat) ||
		!Number.isFinite(current.coord.lon) ||
		Math.abs(current.coord.lat) > 90 ||
		Math.abs(current.coord.lon) > 180 ||
		!Array.isArray(forecast?.list)
	)
		throw new Error('Invalid weather response.');
	const intervals = forecast.list
		.map((item: Record<string, any>) => ({
			endsAt: timestamp(item.dt),
			rainMm3h: rain(item, '3h'),
			probability: number(item.pop, 1)
		}))
		.sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
	if (new Set(intervals.map((i) => i.endsAt)).size !== intervals.length)
		throw new Error('Duplicate forecast intervals.');
	return {
		cell,
		coordinate: cellCenter(cell),
		returnedCoordinate: [current.coord.lat, current.coord.lon],
		observedAt: timestamp(current.dt),
		fetchedAt,
		forecastFetchedAt,
		rainMmH: rain(current, '1h'),
		forecast: intervals
	};
}
export function parseHazards(raw: Record<string, any>): HazardFeature[] {
	if (raw?.type !== 'FeatureCollection' || !Array.isArray(raw.features))
		throw new Error('Invalid MGB polygon response.');
	return raw.features.map((f: any): HazardFeature => {
		const susceptibility = f?.properties?.FloodSusc as Susceptibility;
		if (
			!Object.hasOwn(MODEL.weights, susceptibility) ||
			!f.geometry ||
			!['Polygon', 'MultiPolygon'].includes(f.geometry.type)
		)
			throw new Error('Unknown MGB class or geometry.');
		const polygons =
			f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
		if (!Array.isArray(polygons) || !polygons.length) throw new Error('Empty MGB geometry.');
		for (const polygon of polygons) {
			if (!Array.isArray(polygon) || !polygon.length) throw new Error('Empty MGB polygon.');
			for (const ring of polygon) {
				if (
					!Array.isArray(ring) ||
					ring.length < 4 ||
					ring.some(
						(p: number[]) =>
							!Array.isArray(p) ||
							p.length < 2 ||
							!p.slice(0, 2).every(Number.isFinite) ||
							Math.abs(p[0]) > 180 ||
							Math.abs(p[1]) > 90
					) ||
					ring[0][0] !== ring.at(-1)[0] ||
					ring[0][1] !== ring.at(-1)[1]
				)
					throw new Error('Invalid MGB polygon ring.');
			}
		}
		if (f.properties.OBJECTID === undefined) throw new Error('Missing MGB polygon ID.');
		return {
			type: 'Feature',
			properties: { id: String(f.properties.OBJECTID), susceptibility },
			geometry: f.geometry
		};
	});
}

// Operational caches are process-local and never write to the research database.
export class RainfallService {
	private cache = new Map<string, { expires: number; value: any }>();
	private pending = new Map<string, Promise<any>>();
	private active = 0;
	private queue: Array<() => void> = [];
	private weatherStarts: number[] = [];
	private weatherCooldown = 0;
	private batches = new Map<string, AssessmentBatch>();
	private calculations = new Map<
		string,
		{ fingerprint: string; promise: Promise<AssessmentBatch> }
	>();
	constructor(
		private environment: () => Environment,
		private request: typeof fetch = fetch,
		private clock: () => number = Date.now
	) {}
	private async cached<T>(key: string, ttl: number, make: () => Promise<T>): Promise<T> {
		const cached = this.cache.get(key);
		if (cached && cached.expires > this.clock()) return cached.value;
		if (this.pending.has(key)) return this.pending.get(key)!;
		if (this.pending.size >= 128) throw new Error('Provider queue busy. Retry shortly.');
		const promise = make()
			.then((value) => {
				if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!);
				this.cache.set(key, { expires: this.clock() + ttl, value });
				return value;
			})
			.finally(() => this.pending.delete(key));
		this.pending.set(key, promise);
		return promise;
	}
	private async json(url: URL, weather = false): Promise<any> {
		if (this.active >= 3) await new Promise<void>((resolve) => this.queue.push(resolve));
		else this.active++;
		try {
			if (weather) {
				this.weatherStarts = this.weatherStarts.filter((t) => t > this.clock() - 60000);
				if (this.clock() < this.weatherCooldown || this.weatherStarts.length >= 40)
					throw new Error('Weather request limit reached. Retry in one minute.');
				this.weatherStarts.push(this.clock());
			}
			const response = await this.request(url, {
				signal: AbortSignal.timeout(weather ? 12000 : 30000)
			});
			if (response.status === 429 && weather) {
				const retry = Number(response.headers.get('retry-after'));
				this.weatherCooldown =
					this.clock() +
					Math.max(60000, Number.isFinite(retry) ? Math.min(retry, 3600) * 1000 : 60000);
			}
			if (!response.ok)
				throw new Error(
					`${weather ? 'OpenWeather' : 'MGB'} unavailable (HTTP ${response.status}).`
				);
			const result = await response.json();
			if (result.error) throw new Error('Provider returned an error.');
			return result;
		} catch (error) {
			// Never forward fetch error URLs: OpenWeather includes its key in the query.
			if (
				error instanceof Error &&
				/^(OpenWeather|MGB|Weather request|Provider returned)/.test(error.message)
			)
				throw error;
			throw new Error(`${weather ? 'OpenWeather' : 'MGB'} request failed or timed out.`);
		} finally {
			const next = this.queue.shift();
			if (next) next();
			else this.active--;
		}
	}
	async weather(roads: AssessmentRoad[]): Promise<ProviderResult<WeatherData>> {
		const cells = routeCells(roads);
		if (cells.length > 128)
			return {
				data: { samples: [], errors: ['Route exceeds the 128-cell weather request bound.'] },
				snapshots: []
			};
		const apiKey = this.environment().OPENWEATHER_API_KEY;
		if (!apiKey)
			return {
				data: { samples: [], errors: ['OpenWeather server key is not configured.'] },
				snapshots: []
			};
		const samples: WeatherSample[] = [],
			snapshots: Snapshot[] = [],
			errors: string[] = [];
		// Small batches keep provider work bounded even for long routes.
		for (let start = 0; start < cells.length; start += 3)
			await Promise.all(
				cells.slice(start, start + 3).map(async (cell) => {
					const [lat, lon] = cellCenter(cell);
					try {
						const load = (endpoint: string, ttl: number) =>
							this.cached(`weather:${endpoint}:${cell}`, ttl, async () => {
								const url = new URL(`https://api.openweathermap.org/data/2.5/${endpoint}`);
								url.search = new URLSearchParams({
									lat: String(lat),
									lon: String(lon),
									appid: apiKey,
									units: 'metric'
								}).toString();
								return {
									raw: await this.json(url, true),
									fetchedAt: new Date(this.clock()).toISOString()
								};
							});
						const [currentResult, forecastResult] = await Promise.allSettled([
							load('weather', 600000),
							load('forecast', 3600000)
						]);
						if (currentResult.status === 'rejected') throw currentResult.reason;
						const current = currentResult.value;
						const forecast =
							forecastResult.status === 'fulfilled'
								? forecastResult.value
								: { raw: { list: [] }, fetchedAt: new Date(this.clock()).toISOString() };
						if (forecastResult.status === 'rejected')
							errors.push(`${cell}: Forecast unavailable; current rainfall is still shown.`);
						const parsed = parseWeather(
							current.raw,
							forecast.raw,
							cell,
							current.fetchedAt,
							forecast.fetchedAt
						);
						samples.push(parsed);
						// Provider payload/timestamp identity makes repeated responses deduplicate despite refetch time.
						for (const [product, response] of [
							['current', current],
							['forecast', forecast]
						] as const) {
							if (product === 'forecast' && forecastResult.status === 'rejected') continue;
							const payload = {
								provider: 'OpenWeather',
								product,
								cell,
								requestedCoordinate: [lat, lon],
								fetchedAt: response.fetchedAt,
								raw: response.raw,
								normalized:
									product === 'current'
										? {
												rainMmH: parsed.rainMmH,
												observedAt: parsed.observedAt,
												returnedCoordinate: parsed.returnedCoordinate
											}
										: { intervals: parsed.forecast }
							};
							snapshots.push({
								...snapshot('weather', payload),
								id: hash({ kind: 'weather', product, cell, raw: response.raw })
							});
						}
					} catch (error) {
						errors.push(
							`${cell}: ${error instanceof Error ? error.message : 'Weather unavailable.'}`
						);
					}
				})
			);
		return {
			data: { samples: samples.sort((a, b) => a.cell.localeCompare(b.cell)), errors },
			snapshots
		};
	}
	async hazards(roads: AssessmentRoad[]): Promise<ProviderResult<HazardData>> {
		const points = roads.flatMap((r) => r.polyline);
		const xs = points.map((p) => p[1]),
			ys = points.map((p) => p[0]);
		const bounds = [
			Math.floor(Math.min(...xs) * 50) / 50,
			Math.floor(Math.min(...ys) * 50) / 50,
			Math.ceil(Math.max(...xs) * 50) / 50,
			Math.ceil(Math.max(...ys) * 50) / 50
		];
		try {
			const result = await this.cached(`hazard:${bounds}`, 86400000, async () => {
				const query = (params: Record<string, string>) => {
					const url = new URL(`${MGB_SOURCE}/query`);
					url.search = new URLSearchParams({
						where: '1=1',
						geometry: bounds.join(','),
						geometryType: 'esriGeometryEnvelope',
						inSR: '4326',
						spatialRel: 'esriSpatialRelIntersects',
						...params
					}).toString();
					return this.json(url);
				};
				const count = await query({ returnCountOnly: 'true', f: 'json' });
				if (!Number.isInteger(count.count) || count.count < 0 || count.count > 10000)
					throw new Error('MGB query count is invalid or exceeds the study request limit.');
				const features: HazardFeature[] = [];
				for (let offset = 0; offset < count.count; offset += 500) {
					const page = await query({
						outFields: 'OBJECTID,FloodSusc',
						returnGeometry: 'true',
						outSR: '4326',
						maxAllowableOffset: '0.00001',
						geometryPrecision: '6',
						orderByFields: 'OBJECTID ASC',
						resultOffset: String(offset),
						resultRecordCount: '500',
						f: 'geojson'
					});
					features.push(...parseHazards(page));
				}
				if (
					features.length !== count.count ||
					new Set(features.map((f) => f.properties.id)).size !== features.length
				)
					throw new Error('MGB pagination incomplete.');
				const metadata = await this.json(new URL(`${MGB_SOURCE}?f=json`));
				// ArcGIS returns entire multipart features, sometimes spanning many islands.
				// Keep complete constituent polygons intersecting the request envelope (including holes).
				const localFeatures = features.flatMap((feature): HazardFeature[] => {
					const polygons =
						feature.geometry.type === 'Polygon'
							? [feature.geometry.coordinates]
							: feature.geometry.coordinates;
					const local = polygons.filter((polygon) => {
						const box = [Infinity, Infinity, -Infinity, -Infinity];
						for (const p of polygon[0]) {
							box[0] = Math.min(box[0], p[0]);
							box[1] = Math.min(box[1], p[1]);
							box[2] = Math.max(box[2], p[0]);
							box[3] = Math.max(box[3], p[1]);
						}
						return (
							box[0] <= bounds[2] &&
							box[2] >= bounds[0] &&
							box[1] <= bounds[3] &&
							box[3] >= bounds[1]
						);
					});
					return local.length
						? [{ ...feature, geometry: { type: 'MultiPolygon', coordinates: local } }]
						: [];
				});
				const payload = {
					source: MGB_SOURCE,
					bounds,
					features: localFeatures,
					metadata,
					geometryQuery: { maxAllowableOffsetDegrees: 0.00001, coordinateDecimals: 6 },
					fetchedAt: new Date(this.clock()).toISOString()
				};
				return {
					payload,
					record: {
						...snapshot('hazard', payload),
						id: hash({
							kind: 'hazard',
							source: MGB_SOURCE,
							bounds,
							features: localFeatures,
							metadata
						})
					}
				};
			});
			return {
				data: {
					features: result.payload.features,
					source: MGB_SOURCE,
					fetchedAt: result.payload.fetchedAt,
					verified: this.environment().MGB_DATA_VERIFIED === 'true'
				},
				snapshots: [result.record]
			};
		} catch (error) {
			return {
				data: {
					features: [],
					source: MGB_SOURCE,
					fetchedAt: new Date(this.clock()).toISOString(),
					verified: false,
					error: error instanceof Error ? error.message : 'MGB unavailable.'
				},
				snapshots: []
			};
		}
	}
	async assessment(body: unknown): Promise<ExposureAssessment> {
		const roads = parseRoads(body);
		const { assessmentId, loggingEnabled } = body as {
			assessmentId?: unknown;
			loggingEnabled?: unknown;
		};
		if (
			typeof assessmentId !== 'string' ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assessmentId)
		)
			throw new InputError('Provide a UUID v4 assessment ID.');
		const fingerprint = hash(roads);
		for (const [id, entry] of this.batches)
			if (entry.expires <= this.clock()) this.batches.delete(id);
		let batch = this.batches.get(assessmentId);
		if (batch && batch.fingerprint !== fingerprint)
			throw new InputError('Assessment ID belongs to different routes.');
		if (!batch) {
			let running = this.calculations.get(assessmentId);
			if (running && running.fingerprint !== fingerprint)
				throw new InputError('Assessment ID belongs to different routes.');
			if (!running) {
				if (this.calculations.size >= 20) throw new Error('Assessment queue busy.');
				const promise = (async (): Promise<AssessmentBatch> => {
					const [weather, hazards] = await Promise.all([this.weather(roads), this.hazards(roads)]);
					const assessedAt = new Date(this.clock()).toISOString();
					const result: ExposureAssessment = {
						assessmentId,
						assessedAt,
						modelVersion: MODEL.version,
						...assessRoutes(roads, weather.data, hazards.data, this.clock()),
						weather: weather.data,
						hazards: hazards.data,
						loggingStatus: 'disabled'
					};
					const completed = {
						fingerprint,
						expires: this.clock() + 1800000,
						result,
						snapshots: [...weather.snapshots, ...hazards.snapshots]
					};
					if (this.batches.size >= 100) this.batches.delete(this.batches.keys().next().value!);
					this.batches.set(assessmentId, completed);
					return completed;
				})().finally(() => this.calculations.delete(assessmentId));
				running = { fingerprint, promise };
				this.calculations.set(assessmentId, running);
			}
			batch = await running.promise;
		}
		const response = structuredClone(batch.result);
		if (loggingEnabled === true) {
			try {
				await this.persist({
					id: assessmentId,
					assessedAt: response.assessedAt,
					fingerprint: hash({
						roads,
						result: batch.result,
						snapshots: batch.snapshots.map((s) => s.id)
					}),
					roads,
					model: MODEL,
					result: batch.result,
					snapshots: batch.snapshots
				});
				response.loggingStatus = 'saved';
			} catch {
				response.loggingStatus = 'failed';
			}
		}
		return response;
	}
	private async persist(batch: unknown): Promise<void> {
		const env = this.environment(),
			url = env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL,
			key = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!url || !key) throw new Error('Research logging is not configured.');
		const parsed = new URL(url);
		if (
			parsed.protocol !== 'https:' ||
			!parsed.hostname.endsWith('.supabase.co') ||
			parsed.username ||
			parsed.password
		)
			throw new Error('Invalid research database URL.');
		const response = await this.request(`${parsed.origin}/rest/v1/rpc/save_research_assessment`, {
			method: 'POST',
			headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ p_batch: batch }),
			signal: AbortSignal.timeout(12000)
		});
		if (!response.ok) throw new Error('Research save failed.');
	}
}
