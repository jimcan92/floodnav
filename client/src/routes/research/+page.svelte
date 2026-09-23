<script lang="ts">
	import { createResearchState } from '$lib/states/research/trip.svelte';
	import SettingsDialog from '$lib/components/research/SettingsDialog.svelte';
	import VehicleDialog from '$lib/components/research/VehicleDialog.svelte';
	import TripProgress from '$lib/components/research/TripProgress.svelte';
	import RouteChoices from '$lib/components/research/RouteChoices.svelte';
	import FloodSources from '$lib/components/research/FloodSources.svelte';
	import Planner from '$lib/components/research/Planner.svelte';
	import ResearchMap from '$lib/components/research/ResearchMap.svelte';
	const research = createResearchState();
	let vehicleDialog: VehicleDialog;
	let settingsDialog: SettingsDialog;
	const onVehicle = () => vehicleDialog.open();
	const onSettings = () => settingsDialog.open();
</script>

<svelte:head>
	<title>FloodNav — Flood-aware navigation</title>
	<meta
		name="description"
		content="Metro Cebu rainfall, MGB susceptibility and experimental route recommendations."
	/>
</svelte:head>

<main
	class="app-shell grid min-h-dvh bg-base-200 text-base-content min-[760px]:h-dvh min-[760px]:grid-cols-[360px_1fr] min-[760px]:overflow-hidden"
>
	<aside class="control-panel card gap-4 rounded-none bg-base-100 p-4 min-[760px]:overflow-auto">
		<fieldset
			disabled={!research.trip.mounted}
			inert={!research.trip.mounted}
			class="flex min-w-0 flex-col gap-4"
		>
			<Planner {research} {onVehicle} {onSettings} />
			<FloodSources {research} />
			<RouteChoices {research} />
			<TripProgress {research} />
		</fieldset>
	</aside>

	<ResearchMap {research} {onVehicle} {onSettings} />
</main>

<VehicleDialog {research} bind:this={vehicleDialog} />
<SettingsDialog {research} {onVehicle} bind:this={settingsDialog} />
