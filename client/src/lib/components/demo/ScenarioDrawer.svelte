<script lang="ts">
	import {
		applyConditions,
		demo,
		loadExampleTrip,
		PLAYBACK_SPEEDS,
		navigation
	} from '$lib/states/demo.svelte';
	import { beginPick, cancelPick, setConfiguration, layoutView } from '$lib/states/layout.svelte';

	import ConditionsEditor from './ConditionsEditor.svelte';
	import Icon from '$lib/components/Icon.svelte';
</script>

<aside
	class="controller-drawer fixed top-6 right-6 z-[600] flex max-h-[calc(100dvh-3rem)] w-[420px] max-w-[calc(100vw-3rem)] flex-col overflow-auto rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl max-[759px]:inset-x-2 max-[759px]:top-14 max-[759px]:max-h-80 max-[759px]:w-auto max-[759px]:max-w-none"
	hidden={!layoutView.drawerOpen}
	class:hidden={!layoutView.drawerOpen}
	aria-label="Scenario configuration"
>
	<div class="configuration-close">
		<button class="text-button btn btn-ghost btn-sm" onclick={() => setConfiguration(false)}
			>Close configuration <Icon name="close" size={16} /></button
		>
	</div>
	<div class="playback-control form-control">
		<label class="label" for="playback-speed">Travel playback speed</label>
		<select class="select-bordered select" id="playback-speed" bind:value={demo.playbackSpeed}>
			{#each PLAYBACK_SPEEDS as speed}
				<option value={speed}>{speed}×{speed === 1 ? ' · Real time' : ''}</option>
			{/each}
		</select>
		<p class="mt-1 text-xs opacity-60">
			Demo playback only · live GPS follows your actual movement.
		</p>
	</div>
	{#if navigation.currentSimulation}{#key demo.offlineDemo}<ConditionsEditor
				simulation={navigation.currentSimulation}
				localOnly={demo.offlineDemo}
				picked={demo.picked}
				selectedZone={demo.selectedZone}
				onpick={beginPick}
				oncancelpick={cancelPick}
				onapply={applyConditions}
				onpreview={(zones) => (demo.previewZones = zones)}
			/>{/key}{:else}<p>Loading shared conditions…</p>{/if}
	<p class="controller-disclaimer mt-3 text-xs opacity-70">
		{demo.offlineDemo
			? 'Local changes stay on this device and are never uploaded.'
			: 'No login required · Applied changes affect everyone.'}<br />Travel progress belongs to this
		browser only.
	</p>
	<button
		class="text-button btn btn-ghost btn-sm"
		disabled={!navigation.editable}
		onclick={loadExampleTrip}>Load example trip: Fuente → SM City</button
	>
</aside>
