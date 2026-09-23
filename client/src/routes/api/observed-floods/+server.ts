import { env } from '$env/dynamic/private';
import { getObservedFloods, parseBounds } from '$lib/server/observedFloods';
export async function POST({ request }: { request: Request }) {
	let bounds;
	try {
		const text = await request.text();
		if (text.length > 1024) return Response.json({ error: 'Request too large' }, { status: 413 });
		bounds = parseBounds(JSON.parse(text).bounds);
	} catch { return Response.json({ error: 'Provide valid [west, south, east, north] bounds.' }, { status: 400 }); }
	const configured = Number(env.GFM_FRESHNESS_HOURS || 24);
	const hours = Number.isFinite(configured) && configured > 0 && configured <= 168 ? configured : 24;
	return Response.json(await getObservedFloods(bounds, hours), { headers: { 'Cache-Control': 'no-store' } });
}
