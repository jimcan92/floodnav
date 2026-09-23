<script lang="ts">
	import { demo, navigation } from '$lib/states/demo.svelte';
	import { layout, layoutView } from '$lib/states/layout.svelte';
	import Icon from '$lib/components/Icon.svelte';
	let active = $state<string | null>(null);
	const chips = $derived([
		...(demo.offlineDemo
			? [
					{
						id: 'offline',
						label: 'Offline demo',
						detail: 'Local demo on this device. Live providers need internet.'
					}
				]
			: []),
		{
			id: 'traffic',
			label: navigation.trafficSimulation
				? 'Simulated traffic'
				: navigation.ownRoad?.source === 'osrm'
					? 'Basic ETA'
					: 'Live traffic',
			detail: navigation.trafficSimulation
				? 'Traffic conditions are simulated.'
				: navigation.ownRoad?.source === 'osrm'
					? 'Live traffic unavailable · using basic road directions and estimated ETA.'
					: demo.trafficStatus || 'Loading live traffic…'
		},
		{
			id: 'rainfall',
			label: navigation.floodSimulation ? 'Simulated flooding' : 'Live rainfall',
			detail: navigation.floodSimulation
				? 'Flood zones and water depths are simulated.'
				: demo.rainfallError ||
					(navigation.staleRainfall
						? 'Rainfall assessment is stale. Refresh for updated conditions.'
						: navigation.providerMessage || 'Loading rainfall assessment…')
		},
		...(!navigation.floodSimulation &&
		demo.assessment &&
		!demo.rainfallError &&
		!navigation.staleRainfall &&
		!demo.assessment.hazards.verified
			? [
					{
						id: 'mgb',
						label: 'MGB pending',
						detail:
							'MGB verification pending · exposure ranking unavailable. Susceptibility is background context, not a current flood observation.'
					}
				]
			: []),
		...(!navigation.floodSimulation &&
		demo.assessment?.hazards.verified &&
		!demo.rainfallError &&
		!navigation.staleRainfall &&
		demo.assessment.routes.some((r) => r.score === null)
			? [
					{
						id: 'coverage',
						label: 'Limited coverage',
						detail: 'Route exposure assessment incomplete · flood conditions remain unconfirmed.'
					}
				]
			: []),
		...(demo.previewZones &&
		(layoutView.drawerOpen || layout.picking === 'traffic' || layout.picking === 'flood')
			? [
					{
						id: 'preview',
						label: 'Unpublished preview',
						detail: 'ETA uses applied conditions. These preview changes have not been published.'
					}
				]
			: [])
	]);
	const selected = $derived(chips.find((chip) => chip.id === active));
</script>

<div
	class="status-chips absolute top-7 right-20 left-[400px] z-[410] max-[759px]:top-18 max-[759px]:right-3 max-[759px]:left-3"
>
	<div class="map-source-badges flex gap-2 overflow-x-auto pb-1 text-xs" aria-label="Map status">
		{#each chips as chip (chip.id)}
			<button
				class="btn h-9 min-h-0 shrink-0 rounded-full border-base-300 bg-base-100 px-3 text-xs font-normal text-base-content shadow-sm"
				aria-expanded={active === chip.id}
				aria-controls="map-status-detail"
				onclick={() => (active = active === chip.id ? null : chip.id)}>{chip.label}</button
			>
		{/each}
	</div>
	{#if selected}
		<div
			id="map-status-detail"
			class="mt-2 flex w-80 max-w-full items-start gap-2 rounded-xl border border-base-300 bg-base-100 p-3 text-xs text-base-content shadow-lg"
			role="status"
		>
			<p class="min-w-0 flex-1 leading-relaxed">{selected.detail}</p>
			<button
				class="btn btn-circle btn-ghost btn-xs"
				aria-label="Close status details"
				onclick={() => (active = null)}><Icon name="close" size={14} /></button
			>
		</div>
	{/if}
</div>
<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') active = null;
	}}
	onpointerdown={(event) => {
		if (event.target instanceof Element && !event.target.closest('.status-chips')) active = null;
	}}
/>
