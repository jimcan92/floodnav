<script lang="ts">
	import { dev, version } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';
	import { pwaState } from '$lib/services/pwaState.svelte';
	import { onMount } from 'svelte';
	let offlineDialog: HTMLDialogElement;
	let waiting = $state<ServiceWorker | null>(null),
		changedController = $state(false),
		updateError = $state(''),
		offlineReady = $state(false);
	let registration: ServiceWorkerRegistration | undefined;
	let reloading = false,
		updateRequested = false;
	let installPrompt = $state<
		(Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null
	>(null);
	function reload() {
		if (!reloading) {
			reloading = true;
			location.reload();
		}
	}
	function updateNow() {
		updateError = '';
		if (changedController) reload();
		else if (waiting) {
			updateRequested = true;
			waiting.postMessage({ type: 'SKIP_WAITING' });
		}
	}
	function offlineDemo() {
		offlineDialog.close();
		if (location.pathname === '/') window.dispatchEvent(new Event('floodnav:offline-demo'));
		else location.assign('/?offline-demo=1');
	}
	$effect(() => {
		if (changedController && !pwaState.busy && pwaState.online) reload();
	});
	onMount(() => {
		let disposed = false;
		const reportVersion = () =>
			navigator.serviceWorker?.controller?.postMessage({ type: 'CLIENT_VERSION', version });
		const check = () => {
			if (navigator.onLine && registration)
				void registration.update().catch(() => {
					updateError = 'Update check failed. Will retry when connected.';
				});
			reportVersion();
		};
		const online = () => {
			pwaState.online = true;
			offlineDialog.close();
			check();
		};
		const offline = () => {
			pwaState.online = false;
			if (!offlineDialog.open) offlineDialog.showModal();
		};
		const focus = () => {
			if (!document.hidden) check();
		};
		const install = (event: Event) => {
			event.preventDefault();
			installPrompt = event as typeof installPrompt;
		};
		const installed = () => {
			installPrompt = null;
		};
		window.addEventListener('online', online);
		window.addEventListener('offline', offline);
		window.addEventListener('beforeinstallprompt', install);
		window.addEventListener('appinstalled', installed);
		document.addEventListener('visibilitychange', focus);
		if (!navigator.onLine) offline();
		let hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
		const controllerChange = () => {
			if (hadController) {
				changedController = true;
				waiting = null;
				if (updateRequested && navigator.onLine) reload();
			}
			hadController = true;
			offlineReady = true;
			reportVersion();
		};
		const message = (event: MessageEvent) => {
			if (event.data?.type === 'REQUEST_CLIENT_VERSION') reportVersion();
		};
		if (!dev && 'serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('controllerchange', controllerChange);
			navigator.serviceWorker.addEventListener('message', message);
			void navigator.serviceWorker
				.register('/service-worker.js', { updateViaCache: 'none' })
				.then((reg) => {
					if (disposed) return;
					registration = reg;
					waiting = reg.waiting;
					offlineReady = !!reg.active;
					const watchInstalling = () => {
						const worker = reg.installing;
						worker?.addEventListener('statechange', () => {
							if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller)
								waiting = worker;
						});
					};
					reg.addEventListener('updatefound', watchInstalling);
					watchInstalling();
					reportVersion();
					check();
				})
				.catch(() => {
					if (!disposed) updateError = 'Offline setup unavailable. Reopen online to retry.';
				});
		}
		const timer = setInterval(check, 60000);
		return () => {
			disposed = true;
			clearInterval(timer);
			window.removeEventListener('online', online);
			window.removeEventListener('offline', offline);
			window.removeEventListener('beforeinstallprompt', install);
			window.removeEventListener('appinstalled', installed);
			document.removeEventListener('visibilitychange', focus);
			navigator.serviceWorker?.removeEventListener('controllerchange', controllerChange);
			navigator.serviceWorker?.removeEventListener('message', message);
		};
	});
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" content="#087e96" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-title" content="FloodNav" />
	<meta name="floodnav-version" content={version} />
</svelte:head>

{#if waiting || changedController}
	<aside
		class="pwa-update fixed bottom-4 left-1/2 z-2200 alert grid w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 gap-2 shadow-xl"
		role="status"
		aria-label="App update"
	>
		<strong>Update available</strong>
		<span>
			{pwaState.busy
				? 'Updating will end your trip and discard unsaved edits.'
				: 'A new FloodNav version is ready.'}
		</span>
		<button class="btn" onclick={updateNow} disabled={!pwaState.online}>Update now</button>
	</aside>
{/if}
{#if installPrompt}<button
		class="pwa-install btn fixed bottom-4 left-1/2 z-1400 shadow btn-sm"
		onclick={async () => {
			await installPrompt?.prompt();
			installPrompt = null;
		}}>Install FloodNav</button
	>{/if}
{#if updateError}<p
		class="pwa-error fixed right-3 bottom-2 z-2200 alert max-w-[min(340px,calc(100vw-1.5rem))] text-xs alert-warning"
		role="status"
	>
		{updateError}
	</p>{/if}
<dialog bind:this={offlineDialog} class="pwa-offline modal" aria-labelledby="offline-title">
	<div class="modal-box space-y-4">
		<span class="offline-icon rounded-box bg-primary/10 p-2 text-primary" aria-hidden="true"
			><Icon name="offline" /></span
		>
		<h2 id="offline-title">You’re offline</h2>
		<p>
			Internet is needed for map tiles, live traffic and rainfall, place search, and shared changes.
		</p>
		<p>
			You can still simulate the bundled Fuente → SM City trip with a route diagram, vehicle
			estimates, speed controls, and local flood scenarios. Offline changes stay on this device.
		</p>
		{#if !offlineReady}<p class="offline-hint text-xs text-base-content/70">
				Open the installed app online once to prepare it for future offline launches.
			</p>{/if}
		<button class="offline-primary btn w-full btn-primary" onclick={offlineDemo}
			>Start offline demo</button
		>
		<button class="offline-secondary btn w-full btn-outline" onclick={() => offlineDialog.close()}
			>Stay on this screen</button
		>
	</div>
</dialog>
