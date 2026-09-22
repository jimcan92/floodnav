import { rooms, DemoError } from '$lib/server/demoRooms';
import { body, respond } from '$lib/server/demoHttp';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = ({ params, request }) =>
	respond(async () => {
		const data = await body(request);
		if (params.action === 'claim')
			return rooms.claim(params.roomId, data.travelerId, data.takeover === true);
		if (params.action === 'telemetry')
			return rooms.telemetry(params.roomId, data.travelerId, data.resetVersion, data.telemetry);
		throw new DemoError('Unknown action.', 404);
	});
export const GET: RequestHandler = ({ params, request }) => {
	if (params.action !== 'events') return new Response('Not found', { status: 404 });
	try {
		rooms.get(params.roomId);
	} catch {
		return new Response('Room not found', { status: 404 });
	}
	const encoder = new TextEncoder();
	let cleanup = () => {};
	const stream = new ReadableStream({
		start(controller) {
			let closed = false;
			const send = (text: string) => {
				if (!closed) controller.enqueue(encoder.encode(text));
			};
			const unsubscribe = rooms.subscribe(params.roomId, (room) =>
				send(`data: ${JSON.stringify(room)}\n\n`)
			);
			const timer = setInterval(
				() => send(`data: ${JSON.stringify(rooms.get(params.roomId))}\n\n`),
				10000
			);
			cleanup = () => {
				if (closed) return;
				closed = true;
				clearInterval(timer);
				unsubscribe();
				request.signal.removeEventListener('abort', cleanup);
				try {
					controller.close();
				} catch {}
			};
			request.signal.addEventListener('abort', cleanup, { once: true });
			if (request.signal.aborted) cleanup();
		},
		cancel() {
			cleanup();
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
