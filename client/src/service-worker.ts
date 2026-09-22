/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const prefix = 'floodnav-shell-';
const cacheName = `${prefix}${version}`;
const assets = new Set([...build, ...files]);
const clientVersions = new Map<string, string>();

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(cacheName);
			await cache.addAll([...assets]);
			const shell = await fetch('/', { cache: 'reload' });
			if (
				!shell.ok ||
				!(await shell.clone().text()).includes(`name="floodnav-version" content="${version}"`)
			)
				throw new Error('Deployment changed while preparing offline shell. Retry update.');
			await cache.put('/', shell);
			// Updates wait for the user's Update now action; first installs activate normally.
		})()
	);
});
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			await sw.clients.claim();
			for (const client of await sw.clients.matchAll({ type: 'window' }))
				client.postMessage({ type: 'REQUEST_CLIENT_VERSION' });
		})()
	);
});
sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') event.waitUntil(sw.skipWaiting());
	if (event.data?.type === 'CLIENT_VERSION' && event.source && 'id' in event.source) {
		clientVersions.set(event.source.id, event.data.version);
		event.waitUntil(
			(async () => {
				const clients = await sw.clients.matchAll({ type: 'window' });
				// Retain old assets while another tab is still navigating or editing on an older version.
				if (clients.every((client) => clientVersions.get(client.id) === version))
					await Promise.all(
						(await caches.keys())
							.filter((key) => key.startsWith(prefix) && key !== cacheName)
							.map((key) => caches.delete(key))
					);
			})()
		);
	}
});
sw.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);
	// Never cache API responses, writes, location searches, live data or external map tiles.
	if (
		request.method !== 'GET' ||
		url.origin !== sw.location.origin ||
		url.pathname.startsWith('/api/')
	)
		return;
	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
					if (response.ok || response.status < 500) return response;
				} catch {
					/* Offline: serve the fully cached app shell. */
				}
				if (url.pathname !== '/')
					return Response.redirect(new URL('/?offline-demo=1', url.origin), 302);
				return (
					(await (await caches.open(cacheName)).match('/')) ||
					new Response('Open FloodNav online once to prepare offline demos.', { status: 503 })
				);
			})()
		);
	} else if (assets.has(url.pathname) || url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(
			(async () => {
				const current = await (await caches.open(cacheName)).match(request);
				if (current) return current;
				for (const key of (await caches.keys()).filter((key) => key.startsWith(prefix))) {
					const cached = await (await caches.open(key)).match(request);
					if (cached) return cached;
				}
				return fetch(request);
			})()
		);
	}
});
