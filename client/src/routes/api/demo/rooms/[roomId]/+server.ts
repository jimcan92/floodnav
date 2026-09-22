import { rooms } from '$lib/server/demoRooms';
import { body, respond } from '$lib/server/demoHttp';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ params }) => respond(() => rooms.get(params.roomId));
export const PATCH: RequestHandler = ({ params, request }) =>
	respond(async () => {
		const data = await body(request);
		return rooms.update(params.roomId, data.revision, data.conditions, data.preset);
	});
