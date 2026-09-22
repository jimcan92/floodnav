import { env } from '$env/dynamic/private';
import { DemoError } from '$lib/server/demoRooms';
import { respond } from '$lib/server/demoHttp';
import type { RequestHandler } from './$types';
const cache = new Map<string, { expires: number; data: unknown }>();
let nextAllowed = 0;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
export const GET: RequestHandler = ({ url }) =>
	respond(async () => {
		const q = (url.searchParams.get('q') || '').trim();
		if (q.length < 3 || q.length > 200) throw new DemoError('Enter 3–200 characters.');
		const key = q.toLowerCase(),
			cached = cache.get(key);
		if (cached && cached.expires > Date.now()) return cached.data;
		if (pending >= 10)
			throw new DemoError('Address search is busy. Please try again shortly.', 429);
		pending++;
		const job = queue
			.catch(() => {})
			.then(async () => {
				const hit = cache.get(key);
				if (hit && hit.expires > Date.now()) return hit.data;
				await new Promise((resolve) => setTimeout(resolve, Math.max(0, nextAllowed - Date.now())));
				nextAllowed = Date.now() + 1100;
				const target = new URL(env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search');
				for (const [k, v] of Object.entries({
					q,
					format: 'jsonv2',
					countrycodes: 'ph',
					limit: '6',
					viewbox: '123.7,10.5,124.1,10.1',
					bounded: '0'
				}))
					target.searchParams.set(k, v);
				const response = await fetch(target, {
					headers: {
						'User-Agent':
							env.NOMINATIM_USER_AGENT || 'FloodNav-Cebu-Demo/1.0 (interactive address search)',
						'Accept-Language': 'en'
					},
					signal: AbortSignal.timeout(10000)
				});
				if (!response.ok)
					throw new DemoError(
						'Address search unavailable. Use a preset or choose on the map.',
						503
					);
				const rows = await response.json();
				if (!Array.isArray(rows)) throw new DemoError('Invalid search response.', 502);
				const data = rows
					.map((p: { place_id: number; display_name: string; lat: string; lon: string }) => ({
						id: String(p.place_id),
						name: p.display_name,
						coordinate: [Number(p.lat), Number(p.lon)]
					}))
					.filter((p) => p.coordinate.every(Number.isFinite));
				if (cache.size > 500) cache.delete(cache.keys().next().value!);
				cache.set(key, { data, expires: Date.now() + 86400000 });
				return data;
			});
		queue = job;
		return job.finally(() => pending--);
	});
