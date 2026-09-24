<script lang="ts">
	import type { Snippet } from 'svelte';
	import { demo, navigation, selectDisplayedAlternative } from '$lib/states/demo.svelte';
	import { kmLabel } from '$lib/utils/messages';
	import { formatTravelTime } from '$lib/services/demoSimulation';
	let { routeChoices, conditionsSummary }: { routeChoices: Snippet; conditionsSummary: Snippet } =
		$props();
</script>

{#if !demo.started}{@render routeChoices()}{:else}
	<h2 class="font-semibold">Remaining journey</h2>
	<p>{kmLabel(navigation.remainingMeters)} · {formatTravelTime(navigation.remainingSeconds)}</p>
	{#each navigation.routeAlternatives as road}<button
			class="demo-route-card btn h-auto w-full justify-start gap-3 btn-outline p-3 text-left"
			disabled={demo.rerouting}
			onclick={() => selectDisplayedAlternative(road)}
			>Select alternative · {kmLabel(road.distanceMeters)}</button
		>{/each}
{/if}
{@render conditionsSummary()}
