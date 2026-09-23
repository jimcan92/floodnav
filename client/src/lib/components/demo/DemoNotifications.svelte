<script lang="ts">
	import { formatTravelTime } from '$lib/services/demoSimulation';
	import { pwaState } from '$lib/services/pwaState.svelte';
	import { demo, navigation } from '$lib/states/demo.svelte';
	import { floods } from '$lib/states/floods.svelte';
	import { layout } from '$lib/states/layout.svelte';
	import type { RoadRoute } from '$lib/services/routingService';
	import Icon from '$lib/components/Icon.svelte';

	let {
		onClose,
		onRetrySync,
		onRetry,
		onRetryObserved,
		onFindObservedAlternative,
		onFindAlternative,
		onExitOffline,
		onAcceptAlternative,
		onDismissNotice
	}: {
		onClose: () => void;
		onRetrySync: () => void;
		onRetry: () => void;
		onRetryObserved: () => void;
		onFindObservedAlternative: () => void;
		onFindAlternative: () => void;
		onExitOffline: () => void;
		onAcceptAlternative: (road: RoadRoute) => void;
		onDismissNotice: () => void;
	} = $props();
</script>

<div
	class:hidden={layout.mobile && layout.mobilePanel !== 'notifications'}
	class="demo-alerts fixed right-4 bottom-4 z-[700] flex max-h-[calc(100dvh-2rem)] w-[min(420px,calc(100vw-2rem))] flex-col gap-2 overflow-auto max-[759px]:inset-x-2 max-[759px]:top-22 max-[759px]:bottom-auto max-[759px]:max-h-64 max-[759px]:w-auto"
	id="mobile-notifications"
	aria-label="Notifications"
	aria-live={layout.mobile ? 'off' : 'polite'}
>
	<div
		class="mobile-notification-heading flex items-start justify-between rounded-box bg-base-100 p-4 shadow min-[760px]:hidden"
	>
		<div>
			<h2 id="mobile-notification-title" tabindex="-1">Notifications</h2>
			<small
				>{navigation.trafficSimulation ? 'Simulated traffic' : 'Live traffic'} · {navigation.floodSimulation
					? 'Simulated flooding'
					: 'Live rainfall'}<br />{demo.offlineDemo
					? 'Local offline demo'
					: demo.connected
						? 'Shared conditions connected'
						: 'Shared conditions disconnected'}</small
			>
		</div>
		<button class="btn btn-square btn-ghost" aria-label="Close notifications" onclick={onClose}>
			<Icon name="close" />
		</button>
	</div>

	{#if demo.syncError && !demo.offlineDemo}
		<div class="error-banner alert alert-error" role="alert">
			{demo.syncError}<button class="btn btn-sm" onclick={onRetrySync}>Retry synchronization</button
			>
		</div>
	{/if}
	{#if navigation.mainError}
		<div class="error-banner alert alert-error" role="alert">
			{navigation.mainError}{#if !demo.error}<button class="btn btn-sm" onclick={onRetry}
					>Retry</button
				>{/if}
		</div>
	{/if}
	{#if floods.data?.stale || floods.data?.status === 'unavailable'}
		<div class="error-banner alert alert-error">
			<span
				>Satellite provider unavailable. {floods.data?.fetchedAt
					? 'Showing dated cached observations.'
					: 'Flood conditions remain unknown.'}</span
			>
			<button
				class="btn btn-sm"
				disabled={floods.loading || !pwaState.online || demo.offlineDemo}
				onclick={onRetryObserved}>Retry satellite data</button
			>
		</div>
	{/if}
	{#if navigation.observedEncounters.length}
		<div class="warning-banner alert items-start alert-warning">
			<Icon name="rain" />
			<div>
				<strong>Satellite-observed flooding intersects this route</strong>
				<p>Recent observation, not a confirmed road closure. Check local conditions.</p>
				{#if navigation.canAvoidObserved}<button
						class="btn btn-sm"
						disabled={demo.rerouting}
						onclick={onFindObservedAlternative}
						>{demo.rerouting
							? 'Checking roads…'
							: 'Find alternative around observed flooding'}</button
					>{/if}
			</div>
		</div>
	{/if}
	{#if navigation.blocked}
		<div class="warning-banner alert items-start alert-warning">
			<Icon name="rain" />
			<div>
				<strong
					>{navigation.gpsTravel ? 'Simulated flood ahead' : 'Flood ahead. Travel paused.'}</strong
				>
				<p>A simulated flood blocks the remaining route.</p>
				<button
					class="btn btn-sm"
					disabled={demo.rerouting || !navigation.editable}
					onclick={onFindAlternative}
					>{demo.rerouting ? 'Checking roads…' : 'Find alternative from here'}</button
				>
			</div>
		</div>
	{/if}
	{#if demo.offlineDemo}
		<div class="info-banner alert alert-info">
			<span>Offline route diagram · map tiles and live data need internet.</span
			>{#if pwaState.online}<button class="btn btn-sm" onclick={onExitOffline}
					>Return to shared live mode</button
				>{/if}
		</div>
	{/if}
	{#if !demo.connected && demo.shared && !demo.offlineDemo}
		<div class="info-banner alert alert-info">
			Shared conditions disconnected. {navigation.gpsTravel
				? 'GPS travel remains available.'
				: 'Travel paused.'}<button class="btn btn-sm" onclick={onRetrySync}
				>Retry synchronization</button
			>
		</div>
	{/if}

	{#if demo.started && navigation.gpsTravel && demo.gpsMessage}<div
			class="info-banner alert alert-info"
			role="status"
		>
			{demo.gpsMessage}
		</div>{/if}
	{#if demo.started && navigation.alternative && navigation.alternativeEvaluation}
		<div class="alternative-banner info-banner alert justify-between alert-info">
			<span
				>{navigation.blocked
					? 'Passable alternative'
					: navigation.alternativeEvaluation.seconds < navigation.remainingSeconds
						? 'Faster alternative'
						: 'Alternative route'} · {formatTravelTime(
					navigation.alternativeEvaluation.seconds
				)}{#if !navigation.blocked && navigation.alternativeEvaluation.seconds < navigation.remainingSeconds}
					· Save {formatTravelTime(
						navigation.remainingSeconds - navigation.alternativeEvaluation.seconds
					)}{/if}</span
			>
			<button
				class="btn btn-sm"
				disabled={!navigation.editable || demo.rerouting}
				onclick={() => onAcceptAlternative(navigation.alternative)}>Use alternative</button
			>
		</div>
	{/if}
	{#if demo.notice}
		<div class="info-banner alert justify-between alert-info">
			<span>{demo.notice}</span><button
				class="btn btn-square btn-ghost btn-sm"
				aria-label="Dismiss notice"
				onclick={onDismissNotice}><Icon name="close" size={16} /></button
			>
		</div>
	{/if}
</div>
