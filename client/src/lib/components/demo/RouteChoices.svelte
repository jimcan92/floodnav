<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { formatTravelTime } from '$lib/services/demoSimulation';
	import type { RoadRoute } from '$lib/services/routingService';
	let {
		entries,
		selected,
		disabled = false,
		busy = false,
		recommendedKey,
		floodSimulation,
		onselect
	}: {
		entries: { road: RoadRoute; blocked: boolean; seconds: number }[];
		selected: string;
		disabled?: boolean;
		busy?: boolean;
		recommendedKey?: string | null;
		floodSimulation: boolean;
		onselect: (road: RoadRoute) => void;
	} = $props();
</script>

<div class="route-results-title mb-2 text-sm font-semibold">
	<span>{busy ? 'Finding your route…' : 'Route options'}</span>
</div>
<div class="route-results-content space-y-2">
	{#each entries as result, i (result.road.key)}
		<button
			class="demo-route-card btn h-auto w-full min-w-0 flex-nowrap justify-start gap-3 p-3 text-left"
			class:btn-active={selected === result.road.key}
			{disabled}
			aria-pressed={selected === result.road.key}
			onclick={() => onselect(result.road)}
		>
			<span class="route-card-icon text-primary"><Icon name="car" /></span>
			<span class="route-card-main flex min-w-0 flex-1 flex-col gap-1"
				><strong
					>{result.blocked ? 'Blocked — ETA unavailable' : formatTravelTime(result.seconds)}
					<small class="ml-2 font-normal text-base-content/60"
						>{(result.road.distanceMeters / 1000).toFixed(1)} km</small
					></strong
				>
				<span
					>{!floodSimulation && recommendedKey === result.road.key
						? 'Lower estimated rainfall exposure'
						: i === 0 && !result.blocked
							? 'Recommended route'
							: 'Alternative route'}</span
				>
				{#if result.blocked}<small class="text-error">Blocked by simulated flood</small>{/if}
			</span><span
				class="route-radio h-3 w-3 shrink-0 rounded-full border border-primary"
				class:bg-primary={selected === result.road.key}
			></span>
		</button>
	{/each}
	{#if entries.length === 1 && !busy}<p class="text-xs text-base-content/60">
			Only one route returned by the provider.
		</p>{/if}
	{#if !entries.length && !busy}<p class="quiet-text text-sm text-base-content/60">
			Choose your starting point and destination.
		</p>{/if}
</div>
