<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { SimulationZone } from '$lib/types/demo';
	let {
		zones,
		editing,
		onselect,
		onclear,
		onremove
	}: {
		zones: SimulationZone[];
		editing: string | null;
		onselect: (id: string | null) => void;
		onclear: () => void;
		onremove: (id: string) => void;
	} = $props();
</script>

<section class="zone-section space-y-2">
	<div class="section-title flex items-center justify-between gap-2">
		<h2>Scenario areas <span>{zones.length}</span></h2>
		{#if zones.length}<button
				type="button"
				class="text-button btn btn-ghost btn-xs"
				onclick={() => {
					onclear();
					onselect(null);
				}}>Clear all</button
			>
			>{/if}
	</div>
	{#if !zones.length}<div
			class="empty-zones grid justify-items-center gap-2 rounded-box bg-base-200 p-4 text-center text-base-content/70"
		>
			<Icon name="pin" size={26} />
			<p>No areas yet</p>
			<small>Add an area, then click the map to place it.</small>
		</div>{/if}
	{#each zones as z (z.id)}<div
			class="zone-row flex items-center gap-2 rounded-box border border-base-300 p-2"
			class:border-primary={editing === z.id}
		>
			<button
				type="button"
				class="zone-select btn h-auto min-w-0 flex-1 justify-start btn-ghost p-2 text-left"
				onclick={() => onselect(editing === z.id ? null : z.id)}
				><span
					class:text-info={z.kind === 'flood'}
					class:text-warning={z.kind === 'traffic'}
					class="mini-symbol shrink-0"
					><Icon name={z.kind === 'flood' ? 'rain' : 'traffic'} size={18} /></span
				><span
					><strong>{z.name}</strong><small
						>{z.kind === 'traffic' ? z.level : `${z.depthCm} cm · ${z.rainMmH} mm/h`} · {z.radiusMeters}
						m {z.enabled ? '' : '· Disabled'}</small
					></span
				></button
			><button
				type="button"
				class="icon-button btn btn-square btn-ghost btn-sm"
				aria-label={`Delete ${z.name}`}
				onclick={() => {
					onremove(z.id);
				}}><Icon name="trash" size={17} /></button
			>
		</div>{/each}
</section>
