import { pwaState } from '$lib/services/pwaState.svelte';
import { demo, navigation } from './core.svelte';
import { runtime } from './runtime';
import { syncConditions } from './shared.svelte';
import { startOfflineDemo, tickDemoClock } from './playback.svelte';
import { rebaseAtCurrentPosition } from './geometry.svelte';

export function mountDemo() {
	runtime.disposed = false;
	runtime.session++;
	runtime.syncing = false;
	demo.mounted = true;
	pwaState.online = navigator.onLine;
	if (new URLSearchParams(location.search).get('offline-demo') === '1') startOfflineDemo();
	void syncConditions();
	const ticker = setInterval(tickDemoClock, 250);
	const poll = setInterval(() => {
		if (!document.hidden) void syncConditions();
	}, 2000);
	const refresh = setInterval(() => {
		if (document.hidden || !navigator.onLine || demo.offlineDemo) return;
		if (!navigation.conditions.trafficSimulation && (!demo.playing || navigation.gpsTravel)) {
			if (demo.started && navigation.ownRoad && !navigation.arrived) rebaseAtCurrentPosition();
			demo.routeRequest++;
		}
		if (!navigation.conditions.floodSimulation) demo.weatherRequest++;
	}, 120000);
	const focus = () => {
		void syncConditions();
	};
	const visibility = () => {
		if (document.hidden && !navigation.gpsTravel) demo.playing = false;
		else focus();
	};
	const offline = () => {
		demo.connected = false;
		if (!navigation.gpsTravel && !demo.offlineDemo) demo.playing = false;
	};
	window.addEventListener('floodnav:offline-demo', startOfflineDemo);
	window.addEventListener('focus', focus);
	window.addEventListener('online', focus);
	window.addEventListener('offline', offline);
	document.addEventListener('visibilitychange', visibility);
	return () => {
		runtime.disposed = true;
		runtime.session++;
		demo.mounted = false;
		runtime.rerouteAbort?.abort();
		runtime.rerouteGeneration++;
		runtime.routeGeneration++;
		demo.playing = false;
		clearInterval(ticker);
		clearInterval(poll);
		clearInterval(refresh);
		pwaState.busy = false;
		window.removeEventListener('floodnav:offline-demo', startOfflineDemo);
		window.removeEventListener('focus', focus);
		window.removeEventListener('online', focus);
		window.removeEventListener('offline', offline);
		document.removeEventListener('visibilitychange', visibility);
	};
}
