<script lang="ts">
	import type { ResearchState } from '$lib/states/research/trip.svelte';
	import type { RouteOption } from '$lib/types/navigation';

	let { research }: { research: ResearchState } = $props();
</script>

<!-- Route Options List -->
<section aria-label="Route options" class="space-y-2">
	{#each [research.routes.primary, research.routes.alternativeSafe].filter((r): r is RouteOption => !!r) as route (route.id)}
		<button
			class:btn-active={research.trip.selected === route.id}
			class="route-card btn h-auto w-full flex-col items-stretch gap-2 btn-outline p-3 text-left"
			aria-pressed={research.trip.selected === route.id}
			onclick={() => research.chooseRoute(route.id)}
		>
			<div class="flex items-center justify-between">
				<strong class="text-sm font-bold text-base-content">{route.name}</strong>
				<span class="badge badge-soft {route.isPassable ? 'badge-success' : 'badge-error'}">
					{route.isPassable ? 'Clear' : 'Blocked'}
				</span>
			</div>
			<span class="text-xs text-base-content/70">
				{route.distanceKm.toFixed(2)} km · {Math.ceil(route.durationMinutes)} min · {route.source ===
				'fixture'
					? 'Bundled demo'
					: 'OSRM'}
			</span>
			<span class="text-xs {route.isPassable ? 'text-primary' : 'text-error'}">
				{route.summary}
			</span>
		</button>
	{/each}
</section>

{#if research.trip.status === 'ready' && !research.routes.alternativeSafe}
	<p role="status" class="text-xs text-base-content/70">
		{research.rainfall
			? 'No qualifying lower-exposure alternative available among returned routes.'
			: 'No flood-avoiding alternative found among returned routes.'}
	</p>
{/if}

{#if research.active && !research.active.isPassable}
	<div
		role="alert"
		class="notice alert block space-y-2 border-error/80 bg-error/40 alert-soft text-error"
	>
		<p>
			Selected route blocked by {research.live ? 'sensor-reported water' : 'simulated flood'}.
			Simulation paused.
		</p>
		{#if research.routes.alternativeSafe && research.trip.selected !== 'alternative_safe'}
			<button
				class="btn w-full rounded-lg border border-error bg-error/60 p-2 font-medium text-base-content hover:bg-error"
				onclick={() => research.chooseRoute('alternative_safe')}
			>
				Apply flood-avoiding alternative
			</button>
		{/if}
	</div>
{/if}

{#if !research.active && research.trip.status === 'ready'}
	<p role="alert" class="notice alert block alert-soft text-warning">
		Selected alternative is unavailable. Choose the primary route to inspect it.
	</p>
{/if}
