import { matchGpsToRoute, usableGpsFix } from '$lib/services/gpsNavigation';
import { haversineDistanceKm } from '$lib/services/trafficService';
import type { Coordinate } from '$lib/types/navigation';
import { demo, navigation } from './core.svelte';
import { runtime } from './runtime';

export function routeFromGps(point: Coordinate) {
	demo.completedMeters += demo.progress;
	demo.progress = 0;
	demo.routingStart = point;
	demo.fixture = false;
	demo.candidates = [];
	runtime.rerouteGeneration++;
	demo.routeRequest++;
	runtime.lastGpsReroute = Date.now();
}

export function receiveGps(fix: GeolocationPosition) {
	if (!usableGpsFix(fix)) {
		demo.gpsMessage = 'GPS accuracy is low — waiting for a reliable location';
		return;
	}
	if (fix.timestamp < demo.gpsTimestamp) return;
	demo.gpsPosition = [fix.coords.latitude, fix.coords.longitude];
	demo.gpsAccuracy = fix.coords.accuracy;
	demo.gpsTimestamp = fix.timestamp;
	demo.gpsMessage = '';
	if (!runtime.gpsInitialized) {
		runtime.gpsInitialized = true;
		demo.origin = { name: 'Your location', coordinate: demo.gpsPosition };
		routeFromGps(demo.gpsPosition);
		runtime.lastGpsReroute = 0;
		return;
	}
	updateGpsProgress();
}

export function updateGpsProgress() {
	if (
		!navigation.ownRoad ||
		demo.busy ||
		!demo.gpsPosition ||
		!demo.playing ||
		!demo.gpsTimestamp ||
		Date.now() - demo.gpsTimestamp > 15000
	)
		return;
	const match = matchGpsToRoute(navigation.ownRoad.polyline, demo.gpsPosition, demo.progress);
	demo.offRoute = match.distance > Math.max(50, demo.gpsAccuracy * 1.5);
	if (demo.offRoute) {
		demo.gpsMessage = 'Off route — updating directions';
		if (Date.now() - runtime.lastGpsReroute >= 10000) routeFromGps(demo.gpsPosition);
		return;
	}
	demo.gpsMessage = '';
	demo.progress = match.progress;
	const endpoint = navigation.ownRoad.polyline.at(-1)!;
	if (
		demo.gpsAccuracy <= 30 &&
		navigation.total - demo.progress <= 30 &&
		haversineDistanceKm(demo.gpsPosition, endpoint) * 1000 <= 30
	) {
		demo.gpsArrived = true;
		demo.progress = navigation.total;
		demo.playing = false;
	}
}

export function bindGpsWatch() {
	if (!demo.mounted || !demo.started || !demo.playing || !navigation.gpsTravel) return;
	let active = true;
	const watch = navigator.geolocation.watchPosition(
		(fix) => {
			if (active) receiveGps(fix);
		},
		(error) => {
			if (!active) return;
			demo.gpsMessage =
				error.code === 1
					? 'Location permission denied. Allow location, then Resume.'
					: 'GPS unavailable — waiting for location';
			if (error.code === 1) demo.playing = false;
		},
		{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
	);
	return () => {
		active = false;
		navigator.geolocation.clearWatch(watch);
	};
}
