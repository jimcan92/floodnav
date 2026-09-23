<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { ResearchState } from '$lib/states/research/trip.svelte';

	import { PRESET_DESTINATIONS } from '$lib/data/mockFloodData';
	import NavigationMap from '$lib/components/NavigationMap.svelte';
	let {
		research,
		onVehicle,
		onSettings
	}: { research: ResearchState; onVehicle: () => void; onSettings: () => void } = $props();
</script>

<!-- Map Canvas -->
<section
	class="map-panel relative h-[60dvh] min-h-96 min-[760px]:h-full"
	aria-label="Navigation map"
>
	<!-- Google Maps Category Quick Pills Bar -->
	<div class="top-pill-bar absolute inset-x-3 top-3 z-[450] flex gap-2 overflow-x-auto pb-2">
		<button
			type="button"
			class="category-pill btn shrink-0 rounded-full btn-sm"
			onclick={() => {
				onVehicle();
			}}
		>
			<span><Icon name="car" /></span>
			<span>{research.trip.vehicle.title}</span>
		</button>

		<button
			type="button"
			class="category-pill btn shrink-0 rounded-full btn-sm"
			onclick={() => research.changeMode(research.trip.mode === 'online' ? 'demo' : 'online')}
		>
			<span><Icon name="zap" /></span>
			<span>{research.trip.mode === 'online' ? 'Online Mode' : 'Demo Mode'}</span>
		</button>

		<button
			type="button"
			class="category-pill btn shrink-0 rounded-full btn-sm"
			onclick={() => onSettings()}
		>
			<span><Icon name="rain" /></span>
			<span
				>{research.rainfall
					? 'Rainfall + MGB Active'
					: research.live
						? 'ESP Sensors'
						: 'Simulated'}</span
			>
		</button>

		{#each PRESET_DESTINATIONS.slice(0, 5) as quickPlace}
			<button
				type="button"
				class="category-pill btn shrink-0 rounded-full btn-sm"
				onclick={() => {
					if (research.trip.mode !== 'online') research.changeMode('online');
					research.resetInput();
					research.trip.destination = quickPlace.coordinate;
				}}
			>
				<span><Icon name={quickPlace.icon || 'pin'} /></span>
				<span>{quickPlace.name.split(',')[0]}</span>
			</button>
		{/each}
	</div>

	<NavigationMap
		origin={research.trip.origin}
		destination={research.trip.destination}
		activeRoute={research.active}
		alternativeRoute={research.routes.alternativeSafe}
		vehiclePosition={research.position}
		vehicle={research.trip.vehicle}
		floodZones={research.floods}
		floodSource={research.rainfall ? 'rainfall' : research.live ? 'sensor' : 'simulated'}
		hazardFeatures={research.rainfall ? research.trip.assessment?.hazards.features || [] : []}
		weatherSamples={research.rainfall ? research.trip.assessment?.weather.samples || [] : []}
		onSelectRoute={research.chooseRoute}
		onMapClick={research.trip.mode === 'online'
			? (p) => {
					research.resetInput();
					research.trip.destination = p;
				}
			: undefined}
	/>
</section>
