<script lang="ts">
	import { onMount } from 'svelte';
	import { dev, version } from '$app/environment';
	import { pwaState } from '$lib/services/pwaState.svelte';
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
	<aside class="pwa-update" role="status" aria-label="App update">
		<strong>Update available</strong>
		<span
			>{pwaState.busy
				? 'Updating will end your trip and discard unsaved edits.'
				: 'A new FloodNav version is ready.'}</span
		>
		<button onclick={updateNow} disabled={!pwaState.online}>Update now</button>
	</aside>
{/if}
{#if installPrompt}<button
		class="pwa-install"
		onclick={async () => {
			await installPrompt?.prompt();
			installPrompt = null;
		}}>Install FloodNav</button
	>{/if}
{#if updateError}<p class="pwa-error" role="status">{updateError}</p>{/if}
<dialog bind:this={offlineDialog} class="pwa-offline" aria-labelledby="offline-title">
	<span class="offline-icon" aria-hidden="true">↯</span>
	<h2 id="offline-title">You’re offline</h2>
	<p>
		Internet is needed for map tiles, live traffic and rainfall, place search, and shared changes.
	</p>
	<p>
		You can still simulate the bundled Fuente → SM City trip with a route diagram, vehicle
		estimates, speed controls, and local flood scenarios. Offline changes stay on this device.
	</p>
	{#if !offlineReady}<p class="offline-hint">
			Open the installed app online once to prepare it for future offline launches.
		</p>{/if}
	<button class="offline-primary" onclick={offlineDemo}>Start offline demo</button>
	<button class="offline-secondary" onclick={() => offlineDialog.close()}
		>Stay on this screen</button
	>
</dialog>

<style>
	.pwa-update {
		position: fixed;
		z-index: 2200;
		bottom: 18px;
		left: 50%;
		transform: translateX(-50%);
		width: min(420px, calc(100vw - 32px));
		padding: 16px;
		border: 1px solid #bce8ef;
		border-radius: 16px;
		background: #fff;
		color: #173047;
		box-shadow: 0 8px 35px #15304730;
		display: grid;
		gap: 8px;
		font-size: 13px;
	}
	.pwa-update button,
	.offline-primary {
		background: #087e96;
		color: white;
		border: 0;
		border-radius: 10px;
		padding: 11px 16px;
		cursor: pointer;
		font-weight: 600;
	}
	.pwa-update button:disabled {
		opacity: 0.5;
	}
	.pwa-install {
		position: fixed;
		z-index: 1400;
		top: 12px;
		right: 12px;
		border: 1px solid #c6e7ed;
		border-radius: 20px;
		background: #fff;
		color: #075b70;
		padding: 9px 14px;
		font-size: 12px;
		cursor: pointer;
		box-shadow: 0 3px 15px #15304715;
	}
	.pwa-error {
		position: fixed;
		z-index: 2200;
		bottom: 8px;
		right: 12px;
		max-width: min(340px, calc(100vw - 24px));
		border-radius: 10px;
		padding: 10px;
		background: #fff;
		color: #6b4e24;
		font-size: 12px;
	}
	.pwa-offline {
		width: min(420px, calc(100vw - 32px));
		max-height: calc(100dvh - 40px);
		overflow: auto;
		border: 1px solid #d8e8ec;
		border-radius: 22px;
		padding: 26px;
		margin: auto;
		background: #fff;
		color: #173047;
		box-shadow: 0 18px 70px #15304740;
	}
	.pwa-offline::backdrop {
		background: #152b45a6;
		backdrop-filter: blur(4px);
	}
	.offline-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		background: #e1f3f5;
		color: #087e96;
		font-size: 28px;
		border-radius: 14px;
	}
	.pwa-offline h2 {
		margin: 18px 0 12px;
		font-size: 24px;
		font-weight: 700;
	}
	.pwa-offline p {
		font-size: 14px;
		line-height: 1.6;
		margin: 12px 0;
		color: #52667c;
	}
	.pwa-offline .offline-hint {
		font-size: 12px;
	}
	.pwa-offline button {
		width: 100%;
		margin-top: 10px;
	}
	.offline-secondary {
		border: 1px solid #d8e8ec;
		background: white;
		color: #52667c;
		border-radius: 10px;
		padding: 11px;
		cursor: pointer;
	}
</style>
