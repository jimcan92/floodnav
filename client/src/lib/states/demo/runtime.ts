export const runtime = {
	gpsInitialized: false,
	lastGpsReroute: 0,
	rerouteAbort: null as AbortController | null,
	routeGeneration: 0,
	rerouteGeneration: 0,
	lastSnapshot: 0,
	syncing: false,
	disposed: false,
	session: 0
};
