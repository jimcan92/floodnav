<script lang="ts">
	import { formatTravelTime } from '$lib/services/demoSimulation';
	import { pwaState } from '$lib/services/pwaState.svelte';
	import { speechService } from '$lib/services/speechService';
	import {
		acceptAlternative,
		alternative,
		alternativeEvaluation,
		applyConditions,
		arrived,
		bindGpsWatch,
		bindRainfallFetch,
		bindRouteFetch,
		blocked,
		bumpRerouteSearch,
		conditions,
		currentSimulation,
		demo,
		editable,
		exitOfflineDemo,
		findAlternative,
		findObservedAlternative,
		floodSimulation,
		gpsTravel,
		liveUnavailable,
		loadExampleTrip,
		mapPick,
		mountDemo,
		nextStep,
		notices,
		ownRoad,
		PLAYBACK_SPEEDS,
		position,
		providerMessage,
		ranked,
		remainingMeters,
		remainingSeconds,
		selectRoute,
		stopTrip,
		syncConditions,
		togglePlaying,
		visibleZones
	} from '$lib/states/demo.svelte';
	import { bindObservedFloodFetch, floods, retryFloods, updateFloodBounds } from '$lib/states/floods.svelte';
	import {
		bindLayoutMedia,
		cancelPick,
		drawerOpen,
		layout,
		setConfiguration,
		setMobilePanel
	} from '$lib/states/layout.svelte';
	import { kmLabel } from '$lib/utils/messages';
	import { onMount, untrack } from 'svelte';
	import ConditionsEditor from './ConditionsEditor.svelte';
	import ConditionsSummary from './ConditionsSummary.svelte';
	import DemoHeader from './DemoHeader.svelte';
	import DemoMap from './DemoMap.svelte';
	import DemoNotifications from './DemoNotifications.svelte';
	import Icon from './Icon.svelte';
	import PlannerPanel from './PlannerPanel.svelte';
	import RouteChoices from './RouteChoices.svelte';
	import TripProgress from './TripProgress.svelte';

	$effect(() => {
		pwaState.busy = demo.started || demo.previewZones !== null;
	});
	$effect(() =>
		bindObservedFloodFetch({
			mounted: () => demo.mounted,
			online: () => pwaState.online,
			offlineDemo: () => demo.offlineDemo
		})
	);
	onMount(bindLayoutMedia);
	onMount(() => {
		const cleanup = mountDemo();
		return () => {
			cleanup();
			speechService.cancel();
		};
	});
	$effect(() => bindRouteFetch());
	$effect(() => bindRainfallFetch());
	$effect(() => {
		if (!gpsTravel && (blocked || !editable || liveUnavailable)) demo.playing = false;
	});
	$effect(() => {
		if (
			!demo.playing ||
			demo.muted ||
			!nextStep ||
			demo.busy ||
			(gpsTravel && (demo.gpsMessage || demo.offRoute || !demo.gpsTimestamp))
		)
			return;
		const key = `${ownRoad?.key}:${nextStep.id}`;
		if (demo.lastSpeech !== key) {
			demo.lastSpeech = key;
			untrack(() => speechService.speak(nextStep.instruction));
		}
	});
	$effect(() => {
		if (blocked && demo.mounted && !demo.muted && !gpsTravel)
			untrack(() =>
				speechService.speak('Simulated flood ahead. Travel paused. Check an alternative route.')
			);
	});
	$effect(() => bindGpsWatch());
	$effect(() => {
		const revision = currentSimulation?.revision;
		void demo.vehicleId;
		void demo.roads;
		void demo.selectedKey;
		if (revision === undefined || !editable || demo.busy) return;
		untrack(() => bumpRerouteSearch());
	});
</script>

{#snippet routeChoices()}
	<RouteChoices
		entries={ranked}
		selected={ownRoad?.key || ''}
		disabled={!editable}
		busy={demo.busy}
		recommendedKey={demo.assessment?.recommendedKey}
		{floodSimulation}
		onselect={selectRoute}
	/>
{/snippet}
{#snippet conditionsSummary()}
	<ConditionsSummary
		observed={floods.data}
		loading={floods.loading}
		offline={!pwaState.online || demo.offlineDemo}
		{providerMessage}
		onretry={retryFloods}
	/>
{/snippet}

<svelte:head
	><title>Directions · FloodNav</title><meta
		name="description"
		content="Cebu directions with live GPS tracking and shared demo conditions."
	/></svelte:head
>
<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			layout.picking = null;
			void setMobilePanel(null, true);
		}
	}}
/>
<main
	class="demo-shell relative h-dvh w-full overflow-hidden bg-base-200 text-base-content"
	style:--mobile-viewport-height={layout.mobile && layout.mobileViewportHeight
		? `${layout.mobileViewportHeight}px`
		: undefined}
	class:configuration-open={drawerOpen}
	class:mobile-controls-open={layout.mobilePanel === 'controls'}
	class:mobile-notifications-open={layout.mobilePanel === 'notifications'}
	class:map-picking={!!layout.picking}
>
	<DemoHeader />
	<div class="mobile-map-stage absolute inset-0 z-0">
		<DemoMap
			origin={demo.origin.coordinate}
			destination={demo.destination.coordinate}
			{position}
			followPosition={demo.started && gpsTravel && demo.playing && !!demo.gpsPosition}
			route={ownRoad}
			{alternative}
			zones={visibleZones}
			picking={!!layout.picking}
			liveTraffic={!conditions.trafficSimulation && pwaState.online && !demo.offlineDemo}
			offline={demo.offlineDemo || !pwaState.online}
			assessment={demo.assessment}
			observed={floods.data}
			onbounds={updateFloodBounds}
			onpick={mapPick}
			onzone={(id) => {
				demo.selectedZone = id;
				setConfiguration(true);
			}}
			ontrafficstatus={(value) => (demo.trafficStatus = value)}
		/>
	</div>
	<div
		class="map-source-badges absolute bottom-4 left-4 z-10 flex max-w-[calc(100vw-2rem)] flex-wrap gap-2 text-xs"
	>
		{#if demo.offlineDemo}<span class="badge badge-ghost">Offline demo · this device only</span>{/if}
		<span class="badge badge-ghost"
			><i class:live={!conditions.trafficSimulation}></i>{conditions.trafficSimulation
				? 'Simulated traffic'
				: 'Live traffic'}</span
		><span class="badge badge-ghost"
			><i class:live={!conditions.floodSimulation}></i>{conditions.floodSimulation
				? 'Simulated flooding'
				: 'Live rainfall'}</span
		>
		{#if demo.previewZones && (drawerOpen || layout.picking === 'traffic' || layout.picking === 'flood')}<span
				class="badge badge-warning"
				>Unpublished preview · ETA uses applied conditions</span
			>{/if}
	</div>
	<aside
		class="directions-panel absolute top-6 left-6 z-[450] flex max-h-[calc(100dvh-115px)] w-[360px] flex-col overflow-auto rounded-box border border-base-300 bg-base-100 shadow-xl"
		class:traveling={demo.started}
	>
		<header class="brand-header flex items-center justify-between border-b border-base-300 p-4">
			<a href="/" class="brand flex items-center gap-2 font-bold"
				><span class="brand-mark text-primary"><Icon name="route" size={23} /></span>FloodNav<span
					class="brand-city badge badge-sm">CEBU</span
				></a
			>
			<div class="flex items-center gap-2">
				<span class="demo-label badge badge-outline">{gpsTravel ? 'LIVE GPS' : 'TRAVEL DEMO'}</span>
				<button
					class="icon-button notification-toggle btn btn-circle btn-ghost btn-sm"
					disabled={!demo.mounted}
					aria-label={`Notifications, ${notices} active`}
					aria-expanded={layout.mobilePanel === 'notifications'}
					aria-controls="mobile-notifications"
					onclick={() =>
						setMobilePanel(
							layout.mobilePanel === 'notifications' ? null : 'notifications',
							layout.mobilePanel === 'notifications'
						)}
					><Icon name="bell" size={18} />{#if notices}<span class="badge badge-error badge-xs"
							>{notices}</span
						>{/if}</button
				>
				<button
					class="icon-button btn btn-circle btn-ghost btn-sm"
					aria-label="Simulation controls"
					aria-expanded={drawerOpen}
					disabled={!demo.mounted}
					onclick={() => setConfiguration(!drawerOpen)}><Icon name="settings" size={18} /></button
				>
			</div>
		</header>
		{#if !demo.started}
			<PlannerPanel {routeChoices} {conditionsSummary} />
		{:else}
			<div class="maneuver-card flex items-start gap-3 p-5">
				<span class="maneuver-arrow text-primary"
					><Icon name={arrived ? 'pin' : 'arrow'} size={34} /></span
				>
				<div>
					<small class="opacity-60"
						>{arrived
							? 'JOURNEY COMPLETE'
							: gpsTravel && (demo.offRoute || demo.busy || demo.gpsMessage)
								? 'GPS STATUS'
								: 'NEXT DIRECTION'}</small
					>
					<h1 class="text-xl font-bold">
						{arrived
							? 'You have arrived'
							: gpsTravel && (demo.gpsMessage || demo.busy)
								? demo.gpsMessage || 'Updating directions…'
								: nextStep?.instruction || 'Continue on your route'}
					</h1>
					<p class="opacity-70">
						{arrived
							? demo.destination.name
							: `${Math.max(0, Math.round((nextStep?.progressMeters || 0) - demo.progress))} m ahead`}
					</p>
				</div>
			</div>
		{/if}
		<footer class="simulation-footer flex items-center gap-2 border-t border-base-300 p-3 text-xs">
			<span class="status {demo.connected ? 'status-success' : 'status-warning'} status-sm"></span>
			<span
				>{demo.offlineDemo
					? 'Local offline demo'
					: demo.connected
						? 'Shared conditions connected'
						: 'Connecting…'}</span
			>
		</footer>
	</aside>
	{#if layout.wide}<aside
			class="insights-panel absolute top-6 right-6 z-[400] flex max-h-[calc(100dvh-3rem)] w-[360px] flex-col gap-3 overflow-auto rounded-box border border-base-300 bg-base-100 p-4 shadow-xl"
			aria-label="Route options and conditions"
		>
			{#if !demo.started}{@render routeChoices()}{:else}
				<h2 class="font-semibold">Remaining journey</h2>
				<p>{kmLabel(remainingMeters)} · {formatTravelTime(remainingSeconds)}</p>
				{#each demo.candidates as road}<button
						class="demo-route-card btn btn-outline"
						onclick={() => acceptAlternative(road)}
						>Use alternative · {kmLabel(road.distanceMeters)}</button
					>{/each}
			{/if}
			{@render conditionsSummary()}
		</aside>{/if}
	{#if demo.started}
		<TripProgress
			onToggleMute={() => {
				demo.muted = !demo.muted;
				speechService.setMuted(demo.muted);
			}}
			onTogglePlaying={togglePlaying}
			onStop={stopTrip}
		/>
	{/if}
	<aside
		class="controller-drawer fixed top-6 right-6 z-[600] flex max-h-[calc(100dvh-3rem)] w-[420px] max-w-[calc(100vw-3rem)] flex-col overflow-auto rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl max-[759px]:inset-x-2 max-[759px]:top-14 max-[759px]:w-auto max-[759px]:max-w-none"
		hidden={!drawerOpen}
		aria-label="Scenario configuration"
	>
		<div class="configuration-close">
			<button class="text-button btn btn-ghost btn-sm" onclick={() => setConfiguration(false)}
				>Close configuration <Icon name="close" size={16} /></button
			>
		</div>
		<div class="playback-control form-control">
			<label class="label" for="playback-speed">Travel playback speed</label>
			<select class="select select-bordered" id="playback-speed" bind:value={demo.playbackSpeed}>
				{#each PLAYBACK_SPEEDS as speed}
					<option value={speed}>{speed}×{speed === 1 ? ' · Real time' : ''}</option>
				{/each}
			</select>
			<p class="mt-1 text-xs opacity-60">Demo playback only · live GPS follows your actual movement.</p>
		</div>
		{#if currentSimulation}{#key demo.offlineDemo}<ConditionsEditor
					simulation={currentSimulation}
					localOnly={demo.offlineDemo}
					picked={demo.picked}
					selectedZone={demo.selectedZone}
					onpick={beginPick}
					oncancelpick={cancelPick}
					onapply={applyConditions}
					onpreview={(zones) => (demo.previewZones = zones)}
				/>{/key}{:else}<p>Loading shared conditions…</p>{/if}
		<p class="controller-disclaimer mt-3 text-xs opacity-70">
			{demo.offlineDemo
				? 'Local changes stay on this device and are never uploaded.'
				: 'No login required · Applied changes affect everyone.'}<br />Travel progress belongs to
			this browser only.
		</p>
		<button class="text-button btn btn-ghost btn-sm" disabled={!editable} onclick={loadExampleTrip}
			>Load example trip: Fuente → SM City</button
		>
	</aside>
	<DemoNotifications
		onClose={() => setMobilePanel(null, true)}
		onRetrySync={() => void syncConditions()}
		onRetry={() => {
			demo.routeRequest++;
			demo.weatherRequest++;
		}}
		onRetryObserved={retryFloods}
		onFindObservedAlternative={findObservedAlternative}
		onFindAlternative={() => findAlternative()}
		onExitOffline={exitOfflineDemo}
		onAcceptAlternative={acceptAlternative}
		onDismissNotice={() => (demo.notice = '')}
	/>
	{#if !conditions.trafficSimulation || !conditions.floodSimulation}<div
			class="provider-status desktop-provider-status absolute right-4 bottom-4 z-10 text-xs"
		>
			{providerMessage}
		</div>{/if}
</main>
