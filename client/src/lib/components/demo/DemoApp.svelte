<script lang="ts">
	import DirectionsPanel from './DirectionsPanel.svelte';
	import ScenarioDrawer from './ScenarioDrawer.svelte';

	import { pwaState } from '$lib/services/pwaState.svelte';
	import { speechService } from '$lib/services/speechService';
	import {
		acceptAlternative,
		bindGpsWatch,
		bindRainfallFetch,
		bindRouteFetch,
		bumpRerouteSearch,
		demo,
		exitOfflineDemo,
		findAlternative,
		findObservedAlternative,
		mapPick,
		mountDemo,
		navigation,
		selectRoute,
		stopTrip,
		syncConditions,
		togglePlaying
	} from '$lib/states/demo.svelte';
	import {
		bindObservedFloodFetch,
		floods,
		retryFloods,
		updateFloodBounds
	} from '$lib/states/floods.svelte';
	import {
		bindLayoutMedia,
		layout,
		layoutView,
		setConfiguration,
		setMobilePanel
	} from '$lib/states/layout.svelte';
	import { onMount, untrack } from 'svelte';

	import ConditionsSummary from './ConditionsSummary.svelte';
	import DemoHeader from './DemoHeader.svelte';
	import DemoMap from './DemoMap.svelte';
	import DemoNotifications from './DemoNotifications.svelte';
	import StatusChips from './StatusChips.svelte';

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
		if (
			!navigation.gpsTravel &&
			(navigation.blocked || !navigation.editable || navigation.liveUnavailable)
		)
			demo.playing = false;
	});
	$effect(() => {
		if (
			!demo.playing ||
			demo.muted ||
			!navigation.nextStep ||
			demo.busy ||
			(navigation.gpsTravel && (demo.gpsMessage || demo.offRoute || !demo.gpsTimestamp))
		)
			return;
		const key = `${navigation.ownRoad?.key}:${navigation.nextStep.id}`;
		if (demo.lastSpeech !== key) {
			demo.lastSpeech = key;
			const instruction = navigation.nextStep.instruction;
			untrack(() => speechService.speak(instruction));
		}
	});
	$effect(() => {
		if (navigation.blocked && demo.mounted && !demo.muted && !navigation.gpsTravel)
			untrack(() =>
				speechService.speak('Simulated flood ahead. Travel paused. Check an alternative route.')
			);
	});
	$effect(() => bindGpsWatch());
	$effect(() => {
		const revision = navigation.currentSimulation?.revision;
		void demo.vehicleId;
		void demo.roads;
		void demo.selectedKey;
		if (revision === undefined || !navigation.editable || demo.busy) return;
		untrack(() => bumpRerouteSearch());
	});
</script>

{#snippet routeChoices()}
	<RouteChoices
		entries={navigation.ranked}
		selected={navigation.ownRoad?.key || ''}
		disabled={!navigation.editable}
		busy={demo.busy}
		recommendedKey={demo.assessment?.recommendedKey}
		floodSimulation={navigation.floodSimulation}
		onselect={selectRoute}
	/>
{/snippet}
{#snippet conditionsSummary()}
	<ConditionsSummary
		observed={floods.data}
		loading={floods.loading}
		offline={!pwaState.online || demo.offlineDemo}
		providerMessage={navigation.providerMessage}
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
	class="demo-shell relative h-(--mobile-viewport-height,100dvh) w-full overflow-hidden bg-base-200 text-base-content"
	style:--mobile-viewport-height={layout.mobile && layout.mobileViewportHeight
		? `${layout.mobileViewportHeight}px`
		: undefined}
	class:configuration-open={layoutView.drawerOpen}
	class:mobile-controls-open={layout.mobilePanel === 'controls'}
	class:mobile-notifications-open={layout.mobilePanel === 'notifications'}
	class:map-picking={!!layout.picking}
>
	<DemoHeader />
	<div class="mobile-map-stage absolute inset-0 z-0">
		<DemoMap
			origin={demo.origin.coordinate}
			destination={demo.destination.coordinate}
			position={navigation.position}
			followPosition={demo.started && navigation.gpsTravel && demo.playing && !!demo.gpsPosition}
			route={navigation.ownRoad}
			alternatives={navigation.routeAlternatives}
			onselectalternative={(road) => {
				if (navigation.editable) {
					if (demo.started) acceptAlternative(road);
					else selectRoute(road);
				}
			}}
			zones={navigation.visibleZones}
			picking={!!layout.picking}
			liveTraffic={!navigation.conditions.trafficSimulation && pwaState.online && !demo.offlineDemo}
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
	<StatusChips />
	<DirectionsPanel {routeChoices} {conditionsSummary} />

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
	<ScenarioDrawer />
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
	{#if !navigation.conditions.trafficSimulation || !navigation.conditions.floodSimulation}<div
			class="provider-status desktop-provider-status absolute right-4 bottom-4 z-10 text-xs max-[759px]:hidden"
		>
			{navigation.providerMessage}
		</div>{/if}
</main>
