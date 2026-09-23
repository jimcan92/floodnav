<script lang="ts">
	import { formatTravelTime } from '$lib/services/demoSimulation';
	import type { RoadRoute } from '$lib/services/routingService';
	import type { ObservedFloodFeature, ObservedFloods } from '$lib/types/observedFlood';
	import Icon from './Icon.svelte';

	let {
		mobile,
		mobilePanel,
		notificationCount,
		trafficSimulation,
		floodSimulation,
		offlineDemo,
		connected,
		syncError,
		mainError,
		hasCustomError,
		observed,
		observedLoading,
		online,
		observedEncounters,
		canAvoidObserved,
		rerouting,
		blocked,
		gpsTravel,
		started,
		gpsMessage,
		liveTrafficFallback,
		hasShared,
		remainingSeconds,
		editable,
		alternative,
		alternativeEvaluation,
		providerMessage,
		notice,
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
		mobile: boolean;
		mobilePanel: 'controls' | 'notifications' | 'configuration' | null;
		notificationCount: number;
		trafficSimulation: boolean;
		floodSimulation: boolean;
		offlineDemo: boolean;
		connected: boolean;
		syncError: string;
		mainError: string;
		hasCustomError: boolean;
		observed: ObservedFloods | null;
		observedLoading: boolean;
		online: boolean;
		observedEncounters: ObservedFloodFeature[];
		canAvoidObserved: boolean;
		rerouting: boolean;
		blocked: boolean;
		gpsTravel: boolean;
		started: boolean;
		gpsMessage: string;
		liveTrafficFallback: boolean;
		hasShared: boolean;
		remainingSeconds: number;
		editable: boolean;
		alternative: RoadRoute | null;
		alternativeEvaluation: { seconds: number; blocked: boolean } | null;
		providerMessage: string;
		notice: string;
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
	class="demo-alerts fixed right-4 bottom-4 z-[700] flex max-h-[calc(100dvh-2rem)] w-[min(420px,calc(100vw-2rem))] flex-col gap-2 overflow-auto"
	id="mobile-notifications"
	aria-label="Notifications"
	aria-live={mobile ? 'off' : 'polite'}
>
	<div
		class="mobile-notification-heading flex items-start justify-between rounded-box bg-base-100 p-4 shadow"
	>
		<div>
			<h2 id="mobile-notification-title" tabindex="-1">Notifications</h2>
			<small
				>{trafficSimulation ? 'Simulated traffic' : 'Live traffic'} · {floodSimulation
					? 'Simulated flooding'
					: 'Live rainfall'}<br />{offlineDemo
					? 'Local offline demo'
					: connected
						? 'Shared conditions connected'
						: 'Shared conditions disconnected'}</small
			>
		</div>
		<button class="btn btn-square btn-ghost" aria-label="Close notifications" onclick={onClose}>
			<Icon name="close" />
		</button>
	</div>

	{#if syncError && !offlineDemo}
		<div class="alert alert-error" role="alert">
			{syncError}<button class="btn btn-sm" onclick={onRetrySync}>Retry synchronization</button>
		</div>
	{/if}
	{#if mainError}
		<div class="alert alert-error" role="alert">
			{mainError}{#if !hasCustomError}<button class="btn btn-sm" onclick={onRetry}>Retry</button
				>{/if}
		</div>
	{/if}
	{#if observed?.stale || observed?.status === 'unavailable'}
		<div class="alert alert-error">
			<span
				>Satellite provider unavailable. {observed?.fetchedAt
					? 'Showing dated cached observations.'
					: 'Flood conditions remain unknown.'}</span
			>
			<button
				class="btn btn-sm"
				disabled={observedLoading || !online || offlineDemo}
				onclick={onRetryObserved}>Retry satellite data</button
			>
		</div>
	{/if}
	{#if observedEncounters.length}
		<div class="alert items-start alert-warning">
			<Icon name="rain" />
			<div>
				<strong>Satellite-observed flooding intersects this route</strong>
				<p>Recent observation, not a confirmed road closure. Check local conditions.</p>
				{#if canAvoidObserved}<button
						class="btn btn-sm"
						disabled={rerouting}
						onclick={onFindObservedAlternative}
						>{rerouting ? 'Checking roads…' : 'Find alternative around observed flooding'}</button
					>{/if}
			</div>
		</div>
	{/if}
	{#if blocked}
		<div class="alert items-start alert-warning">
			<Icon name="rain" />
			<div>
				<strong>{gpsTravel ? 'Simulated flood ahead' : 'Flood ahead. Travel paused.'}</strong>
				<p>A simulated flood blocks the remaining route.</p>
				<button class="btn btn-sm" disabled={rerouting || !editable} onclick={onFindAlternative}
					>{rerouting ? 'Checking roads…' : 'Find alternative from here'}</button
				>
			</div>
		</div>
	{/if}
	{#if offlineDemo}
		<div class="alert alert-info">
			<span>Offline route diagram · map tiles and live data need internet.</span>{#if online}<button
					class="btn btn-sm"
					onclick={onExitOffline}>Return to shared live mode</button
				>{/if}
		</div>
	{/if}
	{#if !connected && hasShared && !offlineDemo}
		<div class="alert alert-info">
			Shared conditions disconnected. {gpsTravel
				? 'GPS travel remains available.'
				: 'Travel paused.'}<button class="btn btn-sm" onclick={onRetrySync}
				>Retry synchronization</button
			>
		</div>
	{/if}
	{#if !trafficSimulation && liveTrafficFallback}
		<div class="alert alert-info">
			Live traffic unavailable · using basic road directions and estimated ETA.
		</div>
	{/if}
	{#if started && gpsTravel && gpsMessage}<div class="alert alert-info" role="status">
			{gpsMessage}
		</div>{/if}
	{#if alternative && alternativeEvaluation}
		<div class="alert justify-between alert-info">
			<span
				>{blocked
					? 'Passable alternative'
					: alternativeEvaluation.seconds < remainingSeconds
						? 'Faster alternative'
						: 'Alternative route'} · {formatTravelTime(
					alternativeEvaluation.seconds
				)}{#if !blocked && alternativeEvaluation.seconds < remainingSeconds}
					· Save {formatTravelTime(remainingSeconds - alternativeEvaluation.seconds)}{/if}</span
			>
			<button
				class="btn btn-sm"
				disabled={!editable || rerouting}
				onclick={() => onAcceptAlternative(alternative)}>Use alternative</button
			>
		</div>
	{/if}
	{#if notice}
		<div class="alert justify-between alert-info">
			<span>{notice}</span><button
				class="btn btn-square btn-ghost btn-sm"
				aria-label="Dismiss notice"
				onclick={onDismissNotice}><Icon name="close" size={16} /></button
			>
		</div>
	{/if}
	{#if providerMessage}<div class="alert alert-info">{providerMessage}</div>{/if}
</div>
