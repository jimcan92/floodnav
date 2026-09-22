import { json } from '@sveltejs/kit';
import { DemoError } from './simulationValidation';
export async function body(request: Request) {
	if (!request.headers.get('content-type')?.includes('application/json'))
		throw new DemoError('JSON required.', 415);
	const reader = request.body?.getReader();
	if (!reader) throw new DemoError('Body required.');
	const chunks: Uint8Array[] = [];
	let length = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.length;
		if (length > 2_000_000) {
			await reader.cancel();
			throw new DemoError('Request too large.', 413);
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new DemoError('Invalid JSON.');
	}
}
export async function respond(work: () => unknown | Promise<unknown>) {
	try {
		return json(await work(), { headers: { 'Cache-Control': 'no-store' } });
	} catch (e) {
		return json(
			{ error: e instanceof DemoError ? e.message : 'Service unavailable. Please retry.' },
			{ status: e instanceof DemoError ? e.status : 503 }
		);
	}
}
