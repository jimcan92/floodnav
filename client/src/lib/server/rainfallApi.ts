import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { json } from '@sveltejs/kit';
import { InputError, parseRoads, RainfallService } from './rainfall';

export const rainfallService = new RainfallService(() => ({
	...env,
	PUBLIC_SUPABASE_URL: publicEnv.PUBLIC_SUPABASE_URL
}));
export async function handleRainfall(
	request: Request,
	action: 'weather' | 'hazards' | 'assessment'
): Promise<Response> {
	try {
		if (!request.headers.get('content-type')?.startsWith('application/json'))
			return json({ error: 'JSON request required.' }, { status: 415 });
		if (Number(request.headers.get('content-length')) > 1500000)
			return json({ error: 'Request too large.' }, { status: 413 });
		const reader = request.body?.getReader();
		if (!reader) throw new InputError('Missing JSON request.');
		const chunks: Uint8Array[] = [];
		let size = 0;
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > 1500000) {
				await reader.cancel();
				return json({ error: 'Request too large.' }, { status: 413 });
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		const body = JSON.parse(new TextDecoder().decode(bytes));
		const result =
			action === 'assessment'
				? await rainfallService.assessment(body)
				: (await rainfallService[action](parseRoads(body))).data;
		return json(result, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		return json(
			{
				error:
					error instanceof InputError
						? error.message
						: 'Assessment unavailable. Retry with a valid route.'
			},
			{ status: error instanceof InputError || error instanceof SyntaxError ? 400 : 503 }
		);
	}
}
