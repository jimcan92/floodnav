<script lang="ts">
	import type { ResearchState } from '$lib/states/research/trip.svelte';
	import { VEHICLE_CATEGORIES, DEFAULT_VEHICLE_CATEGORY } from '$lib/data/vehicleCategories';

	let { research }: { research: ResearchState } = $props();
	let vehicleDialog: HTMLDialogElement;
	let previewVehicle = $state(DEFAULT_VEHICLE_CATEGORY);
	export function open() {
		previewVehicle = research.trip.vehicle;
		vehicleDialog.showModal();
	}
</script>

<!-- Vehicle Dialog -->
<dialog bind:this={vehicleDialog} aria-label="Vehicle simulation category" class="modal">
	<div class="modal-box space-y-4">
		<h2 class="mb-4 text-xl font-bold">Vehicle simulation category</h2>
		<div class="mb-4 flex flex-wrap gap-2">
			{#each VEHICLE_CATEGORIES as category}
				<button
					class="btn btn-sm"
					class:btn-primary={previewVehicle.id === category.id}
					aria-pressed={previewVehicle.id === category.id}
					onclick={() => (previewVehicle = category)}
				>
					{category.title}
				</button>
			{/each}
		</div>
		<h3 class="text-lg font-bold text-base-content">{previewVehicle.title}</h3>
		<p class="mt-1 text-sm text-base-content/70">{previewVehicle.subtitle}</p>
		<p class="mt-1 text-sm text-primary">Demo threshold: {previewVehicle.maxSafeWaterDepthCm} cm</p>
		<p class="alert text-sm alert-warning">
			{previewVehicle.warningNotice}
		</p>
		<div class="mt-4 flex justify-end gap-3">
			<button class="btn btn-ghost" onclick={() => vehicleDialog.close()}>
				Kanselahon (Cancel)
			</button>
			<button
				class="btn btn-primary"
				onclick={() => {
					research.trip.vehicle = previewVehicle;
					vehicleDialog.close();
				}}
			>
				Gamita Kini (Select {previewVehicle.title})
			</button>
		</div>
	</div>
</dialog>
