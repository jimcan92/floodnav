<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { ResearchState } from '$lib/states/research/trip.svelte';
	import type { AppMode } from '$lib/types/navigation';
	import { PRESET_ORIGINS, PRESET_DESTINATIONS } from '$lib/data/mockFloodData';

	let {
		research,
		onVehicle,
		onSettings
	}: { research: ResearchState; onVehicle: () => void; onSettings: () => void } = $props();
</script>

<!-- Header with Logo and Settings Toggle -->
<header class="flex items-center justify-between gap-2 border-b border-base-300/80 pb-2">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-black tracking-tight text-base-content">
			FloodNav <span class="badge badge-soft badge-primary">Cebu</span>
		</h1>
		<p class="text-xs text-base-content/70">Flood-aware navigation</p>
	</div>
	<button
		type="button"
		class="btn btn-square btn-ghost"
		onclick={() => onSettings()}
		aria-label="Settings"
		title="Open Settings"
	>
		<span><Icon name="settings" /></span>
	</button>
</header>

<!-- Quick Mode and Vehicle Bar -->
<div class="grid grid-cols-2 gap-2">
	<label class="text-xs text-base-content/70">
		Routing mode
		<select
			aria-label="Routing mode"
			value={research.trip.mode}
			onchange={(e) => research.changeMode(e.currentTarget.value as AppMode)}
			class="select mt-1 w-full"
		>
			<option value="online">Online routes</option>
			<option value="demo">Demo scenarios</option>
		</select>
	</label>
	<div class="flex flex-col gap-1 text-xs text-base-content/70">
		<span>Vehicle Profile</span>
		<button
			type="button"
			class="btn mt-0.5 w-full truncate text-left"
			onclick={() => {
				onVehicle();
			}}
		>
			Vehicle: {research.trip.vehicle.title}
		</button>
	</div>
</div>

<!-- Trip Planning (Demo vs Online Waypoints) -->
{#if research.trip.mode === 'demo'}
	<div class="notice alert block alert-soft">
		<strong class="text-primary">Preset Demo Trip:</strong>
		<p class="mt-0.5 text-xs">Fuente Osmeña Circle → SM City Cebu</p>
	</div>
	<label class="fieldset-label flex flex-col items-start gap-1 whitespace-normal">
		Demo scenario
		<select class="select w-full" aria-label="Demo scenario" bind:value={research.trip.scenario}>
			<option value="dry">Dry roads</option>
			<option value="bypass">Flooded primary / bypass available</option>
			<option value="blocked">All routes blocked</option>
		</select>
	</label>
	<p class="text-xs text-base-content/70">
		Bundled OSRM road routes. Google basemap still needs internet.
	</p>
{:else}
	<!-- Google Maps Style Waypoint Card -->
	<div class="waypoint-card card flex-row gap-3 bg-base-200 p-3">
		<div class="waypoint-visual flex flex-col items-center justify-around text-primary">
			<div class="waypoint-start-dot status status-primary" title="Starting point"></div>
			<div class="waypoint-line h-6 border-l border-dashed border-base-content/40"></div>
			<div class="waypoint-dest-pin text-error" title="Destination"><Icon name="pin" /></div>
		</div>

		<div class="waypoint-fields min-w-0 flex-1 space-y-2">
			<!-- Origin -->
			<div class="waypoint-row flex items-center gap-2">
				<label class="waypoint-label min-w-0 flex-1" for="origin-select">
					<span class="sr-only">Origin</span>
					<select
						id="origin-select"
						aria-label="Origin"
						class="waypoint-select select w-full"
						value={PRESET_ORIGINS.find(
							(p) => p.coordinate.toString() === research.trip.origin.toString()
						)?.id || 'custom'}
						onchange={(e) => {
							const preset = PRESET_ORIGINS.find((p) => p.id === e.currentTarget.value);
							if (preset) {
								research.resetInput();
								research.trip.origin = preset.coordinate;
							}
						}}
					>
						<option value="custom" disabled>GPS / custom origin</option>
						{#each PRESET_ORIGINS as preset}
							<option value={preset.id}>{preset.name}</option>
						{/each}
					</select>
				</label>
				<button
					type="button"
					class="gps-btn btn btn-square btn-ghost"
					onclick={research.locate}
					disabled={research.trip.locating}
					title="Use my GPS location"
					aria-label="Use my GPS location"
				>
					<Icon name={research.trip.locating ? 'loader' : 'pin'} />
				</button>
			</div>

			<!-- Swap Button -->
			<div class="waypoint-divider flex justify-end">
				<button
					type="button"
					class="waypoint-swap-btn btn btn-circle btn-ghost btn-sm"
					onclick={research.swapWaypoints}
					title="Swap start and destination"
					aria-label="Swap start and destination"
				>
					<Icon name="swap" />
				</button>
			</div>

			<!-- Destination -->
			<div class="waypoint-row flex items-center gap-2">
				<label class="waypoint-label min-w-0 flex-1" for="destination-select">
					<span class="sr-only">Destination</span>
					<select
						id="destination-select"
						aria-label="Destination"
						class="waypoint-select select w-full"
						value={PRESET_DESTINATIONS.find(
							(p) => p.coordinate.toString() === research.trip.destination.toString()
						)?.id || 'custom'}
						onchange={(e) => {
							const preset = PRESET_DESTINATIONS.find((p) => p.id === e.currentTarget.value);
							if (preset) {
								research.resetInput();
								research.trip.destination = preset.coordinate;
							}
						}}
					>
						<option value="custom" disabled>Map pin destination</option>
						{#each PRESET_DESTINATIONS as preset}
							<option value={preset.id}>{preset.name}</option>
						{/each}
					</select>
				</label>
			</div>
		</div>
	</div>
	<p class="px-1 text-xs text-base-content/70">
		<Icon name="lightbulb" /> Click the map to choose another destination.
	</p>

	<!-- Suggested & Popular Destinations (Google Maps Style) -->
	<div class="places-section space-y-2">
		<div class="flex items-center justify-between px-1 pt-1">
			<span class="text-[11px] font-bold tracking-wider text-base-content/70 uppercase"
				>Popular Cebu Spots</span
			>
			<span class="text-[10px] text-base-content/70">{PRESET_DESTINATIONS.length} locations</span>
		</div>
		<div class="max-h-44 space-y-0.5 overflow-y-auto pr-0.5">
			{#each PRESET_DESTINATIONS as place}
				<button
					type="button"
					class="place-item btn h-auto w-full justify-start btn-ghost py-2 text-left"
					onclick={() => {
						research.resetInput();
						research.trip.destination = place.coordinate;
					}}
				>
					<div class="place-icon-circle rounded-box bg-primary/10 p-2 text-primary">
						<Icon name={place.icon || 'pin'} />
					</div>
					<div class="place-details min-w-0 text-left">
						<div class="place-title font-semibold">{place.name}</div>
						<div class="place-desc text-xs font-normal text-base-content/70">
							{place.shortDescription}
						</div>
					</div>
				</button>
			{/each}
		</div>
	</div>
{/if}
