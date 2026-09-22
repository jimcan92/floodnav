import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { json } from '@sveltejs/kit';
import { body, respond } from '$lib/server/demoHttp';
import { SimulationStore } from '$lib/server/simulationStore';
import type { RequestHandler } from './$types';

const store = new SimulationStore(() => ({
	...env,
	PUBLIC_SUPABASE_URL: publicEnv.PUBLIC_SUPABASE_URL
}));
export const GET: RequestHandler = () => respond(() => store.get());
export const PATCH: RequestHandler = async ({ request }) => {
	let conflict = false;
	const response = await respond(async () => {
		const data = await body(request);
		const saved = await store.update(data?.revision, data?.conditions, data?.preset);
		if (saved) return saved;
		conflict = true;
		return {
			error: 'Conditions changed. Review the latest settings before applying your draft.',
			latest: await store.get()
		};
	});
	return conflict && response.status === 200
		? json(await response.json(), { status: 409, headers: { 'Cache-Control': 'no-store' } })
		: response;
};
