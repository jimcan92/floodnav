<script lang="ts">
	import MobileTripSummary from './MobileTripSummary.svelte';
	import { VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
	import { evaluateSimulation, VEHICLE_TRAVEL_PROFILES } from '$lib/services/demoSimulation';
	import {
		beginPick,
		changeWaypoint,
		demo,
		locate,
		startTrip,
		swapWaypoints,
		navigation
	} from '$lib/states/demo.svelte';
	import { layout } from '$lib/states/layout.svelte';
	import { vehicleEta } from '$lib/utils/messages';
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LocationPicker from './LocationPicker.svelte';

	let { routeChoices, conditionsSummary }: { routeChoices: Snippet; conditionsSummary: Snippet } =
		$props();
</script>

<MobileTripSummary />
<div
	class:hidden={layout.mobile && layout.mobilePanel !== 'controls'}
	class="planner-body space-y-4 p-5"
	id="mobile-planner"
>
	<div class="planner-title">
		<h1 class="text-2xl font-bold">Where to?</h1>
		<p class="text-sm opacity-70">A clearer route through changing conditions.</p>
	</div>
	<div class="vehicle-options grid grid-cols-5 gap-2" role="group" aria-label="Vehicle">
		{#each VEHICLE_CATEGORIES as option}
			{@const profile = VEHICLE_TRAVEL_PROFILES[option.id]}
			{@const estimate = navigation.ownRoad
				? evaluateSimulation(
						navigation.ownRoad,
						navigation.conditions,
						option.maxSafeWaterDepthCm,
						demo.progress,
						option.id
					)
				: null}
			<button
				class="vehicle-option btn h-auto min-h-0 flex-col gap-1 py-2"
				class:btn-primary={demo.vehicleId === option.id}
				class:btn-ghost={demo.vehicleId !== option.id}
				class:btn-active={demo.vehicleId === option.id}
				aria-pressed={demo.vehicleId === option.id}
				aria-label={profile.label}
				title={option.title}
				disabled={!navigation.editable}
				onclick={() => (demo.vehicleId = option.id)}
			>
				<span class="vehicle-option-icon"><Icon name={profile.icon} size={22} /></span>
				<span class="vehicle-option-label text-xs">{profile.label}</span>
				<span class="vehicle-option-eta text-[11px] opacity-70"
					>{vehicleEta(estimate, demo.busy)}</span
				>
			</button>
		{/each}
	</div>
	<p class="vehicle-estimate-note text-xs opacity-60">
		Estimated vehicle timing · same driving route
	</p>
	<div class="waypoint-stack relative pr-10">
		<div class="waypoint-editors">
			<LocationPicker
				label="Starting point"
				value={demo.origin}
				disabled={!navigation.editable || demo.offlineDemo}
				onchoose={(place) => changeWaypoint('origin', place)}
				onpick={() => beginPick('origin')}
				ongps={locate}
			/><LocationPicker
				label="Destination"
				value={demo.destination}
				disabled={!navigation.editable || demo.offlineDemo}
				onchoose={(place) => changeWaypoint('destination', place)}
				onpick={() => beginPick('destination')}
			/>
		</div>
		<button
			class="swap-button icon-button btn absolute top-10 right-0 btn-circle btn-ghost btn-sm"
			aria-label="Swap start and destination"
			disabled={!navigation.editable || demo.offlineDemo}
			onclick={swapWaypoints}><Icon name="swap" size={19} /></button
		>
	</div>
</div>
<div class="route-results space-y-3 p-5 pt-0">
	{#if !layout.wide && (!layout.mobile || layout.mobilePanel === 'controls')}{@render routeChoices()}{/if}
	<label
		class:hidden={layout.mobile && layout.mobilePanel !== 'controls'}
		class="travel-mode form-control text-sm"
		>Travel mode
		<select
			class="select-bordered select select-sm"
			aria-label="Travel mode"
			disabled={demo.offlineDemo}
			value={navigation.travelMode}
			onchange={(event) => (demo.requestedMode = event.currentTarget.value as 'gps' | 'demo')}
		>
			<option value="gps">Live GPS · actual travel</option>
			<option value="demo">Demo playback</option>
		</select></label
	>
	<button
		class="primary-button start-button btn w-full btn-primary"
		disabled={!demo.mounted ||
			!navigation.ownRoad ||
			demo.busy ||
			(!navigation.gpsTravel &&
				(!navigation.editable || navigation.blocked || navigation.liveUnavailable))}
		onclick={startTrip}><Icon name="play" size={18} />Start travel</button
	>
	<p
		class:hidden={layout.mobile && layout.mobilePanel !== 'controls'}
		class="demo-footnote text-xs opacity-60"
	>
		{navigation.gpsTravel
			? 'Uses your device location · keep this page open'
			: `Simulated travel · ${demo.playbackSpeed}× playback`}
	</p>
	{#if !layout.wide && (!layout.mobile || layout.mobilePanel === 'controls')}<div
			class="inline-conditions"
		>
			{@render conditionsSummary()}
		</div>{/if}
</div>
