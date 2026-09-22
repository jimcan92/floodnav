import { rooms } from '$lib/server/demoRooms';
import { respond } from '$lib/server/demoHttp';
export const POST = () => respond(() => rooms.create());
