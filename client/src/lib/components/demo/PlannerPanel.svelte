<script lang="ts">
	import MobileTripSummary from './MobileTripSummary.svelte';
	import { VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
	import { VEHICLE_TRAVEL_PROFILES } from '$lib/services/demoSimulation';
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
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LocationPicker from './LocationPicker.svelte';

	let { routeChoices, conditionsSummary }: { routeChoices: Snippet; conditionsSummary: Snippet } =
		$props();
</script>

<MobileTripSummary />
<div
	class:hidden={layout.mobile && layout.mobilePanel !== 'controls'}
	class="planner-body min-w-0 space-y-4 p-4"
	id="mobile-planner"
>
	<div
		class="vehicle-options flex items-center justify-between gap-1"
		role="group"
		aria-label="Vehicle"
	>
		{#each VEHICLE_CATEGORIES as option}
			{@const profile = VEHICLE_TRAVEL_PROFILES[option.id]}
			<button
				class="vehicle-option btn btn-circle btn-sm"
				class:btn-primary={demo.vehicleId === option.id}
				class:btn-ghost={demo.vehicleId !== option.id}
				class:btn-active={demo.vehicleId === option.id}
				aria-pressed={demo.vehicleId === option.id}
				aria-label={profile.label}
				title={`${profile.label} · ${option.title}`}
				disabled={!navigation.editable}
				onclick={() => (demo.vehicleId = option.id)}
			>
				<span class="vehicle-option-icon"><Icon name={profile.icon} size={22} /></span>
			</button>
		{/each}
	</div>
	<div class="waypoint-stack relative pr-10">
		<div class="waypoint-editors min-w-0">
			<LocationPicker
				label="Starting point"
				compact
				value={demo.origin}
				disabled={!navigation.editable || demo.offlineDemo}
				onchoose={(place) => changeWaypoint('origin', place)}
				onpick={() => beginPick('origin')}
				ongps={locate}
			/><LocationPicker
				label="Destination"
				compact
				value={demo.destination}
				disabled={!navigation.editable || demo.offlineDemo}
				onchoose={(place) => changeWaypoint('destination', place)}
				onpick={() => beginPick('destination')}
			/>
		</div>
		<button
			class="swap-button icon-button btn absolute top-7 right-0 btn-circle btn-ghost btn-sm"
			aria-label="Swap start and destination"
			disabled={!navigation.editable || demo.offlineDemo}
			onclick={swapWaypoints}><Icon name="swap" size={19} /></button
		>
	</div>
</div>
<div class="route-results min-w-0 space-y-3 p-4 pt-0">
	{#if !layout.mobile || layout.mobilePanel === 'controls'}{@render routeChoices()}{/if}
	<label
		class:hidden={layout.mobile && layout.mobilePanel !== 'controls'}
		class="travel-mode flex min-w-0 flex-col gap-1.5 text-sm"
		>Travel mode
		<select
			class="select-bordered select w-full"
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
	{#if !layout.mobile || layout.mobilePanel === 'controls'}<div class="inline-conditions">
			{@render conditionsSummary()}
		</div>{/if}
</div>
