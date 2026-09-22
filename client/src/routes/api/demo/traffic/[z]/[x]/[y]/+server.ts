import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
const cache = new Map<string, { expires: number; bytes: ArrayBuffer }>();
export const GET: RequestHandler = async ({ params }) => {
	if (!env.TOMTOM_API_KEY) return new Response('Live traffic not configured', { status: 503 });
	const { z, x, y } = params;
	if (![z, x, y].every((v) => /^\d{1,8}$/.test(v)) || +z > 20 || +x >= 2 ** +z || +y >= 2 ** +z)
		return new Response('Invalid tile', { status: 400 });
	const tileKey = `${z}/${x}/${y}`,
		hit = cache.get(tileKey);
	const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' };
	if (hit && hit.expires > Date.now()) return new Response(hit.bytes.slice(0), { headers });
	try {
		const result = await fetch(
			`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${encodeURIComponent(env.TOMTOM_API_KEY)}`,
			{ signal: AbortSignal.timeout(10000) }
		);
		if (!result.ok) return new Response('Traffic layer unavailable', { status: 503 });
		const bytes = await result.arrayBuffer();
		if (cache.size >= 300) cache.delete(cache.keys().next().value!);
		cache.set(tileKey, { bytes, expires: Date.now() + 60000 });
		return new Response(bytes.slice(0), { headers });
	} catch {
		return new Response('Traffic layer unavailable', { status: 503 });
	}
};
