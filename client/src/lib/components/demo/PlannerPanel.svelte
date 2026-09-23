<script lang="ts">
	import { VEHICLE_CATEGORIES } from '$lib/data/vehicleCategories';
	import {
		evaluateSimulation,
		formatTravelTime,
		VEHICLE_TRAVEL_PROFILES
	} from '$lib/services/demoSimulation';
	import {
		beginPick,
		blocked,
		changeWaypoint,
		conditions,
		demo,
		editable,
		gpsTravel,
		liveUnavailable,
		locate,
		ownRoad,
		remainingSeconds,
		startTrip,
		swapWaypoints,
		travelMode,
		vehicle
	} from '$lib/states/demo.svelte';
	import { layout, setMobilePanel } from '$lib/states/layout.svelte';
	import { kmLabel, vehicleEta } from '$lib/utils/messages';
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import LocationPicker from './LocationPicker.svelte';

	let { routeChoices, conditionsSummary }: { routeChoices: Snippet; conditionsSummary: Snippet } =
		$props();
</script>

<button
	class="mobile-sheet-summary btn btn-ghost h-auto min-h-0 w-full justify-between rounded-none py-3"
	disabled={!demo.mounted}
	aria-expanded={layout.mobilePanel === 'controls'}
	aria-controls="mobile-planner"
	aria-label={layout.mobilePanel === 'controls' ? 'Collapse trip controls' : 'Expand trip controls'}
	onclick={() => setMobilePanel(layout.mobilePanel === 'controls' ? null : 'controls')}
>
	<span class="text-left"
		><strong>{demo.destination.name || 'Choose destination'}</strong><small class="block opacity-70"
			>{VEHICLE_TRAVEL_PROFILES[vehicle.id].label} · {gpsTravel ? 'GPS' : 'Demo'} · {demo.busy
				? 'Finding route…'
				: blocked
					? 'Blocked'
					: ownRoad
						? `${formatTravelTime(remainingSeconds)} · ${kmLabel(ownRoad.distanceMeters)}`
						: 'Choose destination'}</small
		></span
	><Icon name="chevron" />
</button>
<div class="planner-body space-y-4 p-5" id="mobile-planner">
	<div class="planner-title">
		<h1 class="text-2xl font-bold">Where to?</h1>
		<p class="text-sm opacity-70">A clearer route through changing conditions.</p>
	</div>
	<div class="vehicle-options grid grid-cols-5 gap-2" role="group" aria-label="Vehicle">
		{#each VEHICLE_CATEGORIES as option}
			{@const profile = VEHICLE_TRAVEL_PROFILES[option.id]}
			{@const estimate = ownRoad
				? evaluateSimulation(
						ownRoad,
						conditions,
						option.maxSafeWaterDepthCm,
						demo.progress,
						option.id
					)
				: null}
			<button
				class="vehicle-option btn h-auto min-h-0 flex-col gap-1 py-2"
				class:btn-primary={demo.vehicleId === option.id}
				class:btn-ghost={demo.vehicleId !== option.id}
				class:selected={demo.vehicleId === option.id}
				aria-pressed={demo.vehicleId === option.id}
				aria-label={profile.label}
				title={option.title}
				disabled={!editable}
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
	<p class="vehicle-estimate-note text-xs opacity-60">Estimated vehicle timing · same driving route</p>
	<div class="waypoint-stack relative pr-10">
		<div class="waypoint-editors">
			<LocationPicker
				label="Starting point"
				value={demo.origin}
				disabled={!editable || demo.offlineDemo}
				onchoose={(place) => changeWaypoint('origin', place)}
				onpick={() => beginPick('origin')}
				ongps={locate}
			/><LocationPicker
				label="Destination"
				value={demo.destination}
				disabled={!editable || demo.offlineDemo}
				onchoose={(place) => changeWaypoint('destination', place)}
				onpick={() => beginPick('destination')}
			/>
		</div>
		<button
			class="swap-button icon-button btn btn-circle btn-ghost btn-sm absolute top-10 right-0"
			aria-label="Swap start and destination"
			disabled={!editable || demo.offlineDemo}
			onclick={swapWaypoints}><Icon name="swap" size={19} /></button
		>
	</div>
</div>
<div class="route-results space-y-3 p-5 pt-0">
	{#if !layout.wide}{@render routeChoices()}{/if}
	<label class="travel-mode form-control text-sm"
		>Travel mode
		<select
			class="select select-bordered select-sm"
			aria-label="Travel mode"
			disabled={demo.offlineDemo}
			value={travelMode}
			onchange={(event) => (demo.requestedMode = event.currentTarget.value as 'gps' | 'demo')}
		>
			<option value="gps">Live GPS · actual travel</option>
			<option value="demo">Demo playback</option>
		</select></label
	>
	<button
		class="primary-button start-button btn btn-primary w-full"
		disabled={!demo.mounted ||
			!ownRoad ||
			demo.busy ||
			(!gpsTravel && (!editable || blocked || liveUnavailable))}
		onclick={startTrip}><Icon name="play" size={18} />Start travel</button
	>
	<p class="demo-footnote text-xs opacity-60">
		{gpsTravel
			? 'Uses your device location · keep this page open'
			: `Simulated travel · ${demo.playbackSpeed}× playback`}
	</p>
	{#if !layout.wide}<div class="inline-conditions">{@render conditionsSummary()}</div>{/if}
</div>
