import { env } from '$env/dynamic/private';
import { coordinate, DemoError } from '$lib/server/demoRooms';
import { body, respond } from '$lib/server/demoHttp';
import { parseTomTomRoutes } from '$lib/services/tomtomRoutes';
import type { RequestHandler } from './$types';
const cache = new Map<string, { at: number; routes: ReturnType<typeof parseTomTomRoutes> }>();
export const POST: RequestHandler = ({ request }) =>
	respond(async () => {
		if (!env.TOMTOM_API_KEY)
			throw new DemoError(
				'Live traffic not configured. Add TOMTOM_API_KEY or enable traffic simulation.',
				503
			);
		const { origin, destination } = await body(request);
		coordinate(origin);
		coordinate(destination);
		const key = JSON.stringify([origin, destination]);
		const cached = cache.get(key);
		if (cached && Date.now() - cached.at < 60000) return cached.routes;
		const url = new URL(
			`https://api.tomtom.com/routing/1/calculateRoute/${origin.join(',')}:${destination.join(',')}/json`
		);
		for (const [k, v] of Object.entries({
			key: env.TOMTOM_API_KEY,
			traffic: 'true',
			departAt: 'now',
			maxAlternatives: '2',
			instructionsType: 'text',
			language: 'en-US',
			computeTravelTimeFor: 'all'
		}))
			url.searchParams.set(k, v);
		const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
		if (!response.ok)
			throw new DemoError(
				`Live traffic routing unavailable (${response.status}). Enable simulation or retry.`,
				503
			);
		const routes = parseTomTomRoutes(await response.json());
		if (cache.size > 200) cache.clear();
		cache.set(key, { at: Date.now(), routes });
		return routes;
	});
