<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { SimulationZone } from '$lib/types/demo';
	let {
		zone,
		update,
		onclose
	}: {
		zone: SimulationZone;
		update: (patch: Partial<SimulationZone>) => void;
		onclose: () => void;
	} = $props();
</script>

<section
	class="zone-editor card gap-3 border-2 border-primary bg-base-100 p-4 ring-2 ring-primary/15"
	aria-label="Area editor"
>
	<div class="section-title flex items-center justify-between gap-2">
		<h2>Edit {zone.kind} area</h2>
		<button
			type="button"
			class="icon-button btn btn-square btn-ghost btn-sm"
			aria-label="Close area editor"
			onclick={onclose}><Icon name="close" size={17} /></button
		>
	</div>
	<div class="rounded-box bg-primary/10 p-3 text-sm">
		<p class="font-semibold text-primary">Set this area’s parameters</p>
		<p class="mt-1">
			{zone.kind === 'traffic'
				? 'Set the area name, radius, and traffic level below.'
				: 'Set the area name, radius, flood depth, and rainfall below.'}
			Keep Area enabled checked to include it in the simulation, then select Apply changes below to save.
		</p>
	</div>
	<label class="fieldset-label flex flex-col items-start gap-1 whitespace-normal"
		>Area name<input
			class="input w-full"
			required
			maxlength="100"
			value={zone.name}
			oninput={(e) => update({ name: e.currentTarget.value })}
		/></label
	>
	<label class="fieldset-label flex flex-col items-start gap-1 whitespace-normal"
		>Radius (m)<input
			class="input w-full"
			type="number"
			min="10"
			max="1000"
			required
			value={zone.radiusMeters}
			oninput={(e) => update({ radiusMeters: e.currentTarget.valueAsNumber })}
		/></label
	>
	{#if zone.kind === 'traffic'}<label
			class="fieldset-label flex flex-col items-start gap-1 whitespace-normal"
			>Traffic level<select
				class="select w-full"
				value={zone.level}
				onchange={(e) => update({ level: e.currentTarget.value as SimulationZone['level'] })}
				><option value="light">Light</option><option value="moderate">Moderate</option><option
					value="heavy">Heavy</option
				></select
			></label
		>
	{:else}<div class="field-pair grid grid-cols-2 gap-3">
			<label class="fieldset-label flex flex-col items-start gap-1 whitespace-normal"
				>Flood depth (cm)<input
					class="input w-full"
					type="number"
					min="0"
					max="200"
					required
					value={zone.depthCm}
					oninput={(e) => update({ depthCm: e.currentTarget.valueAsNumber })}
				/></label
			><label class="fieldset-label flex flex-col items-start gap-1 whitespace-normal"
				>Rainfall (mm/h)<input
					class="input w-full"
					type="number"
					min="0"
					max="300"
					required
					value={zone.rainMmH}
					oninput={(e) => update({ rainMmH: e.currentTarget.valueAsNumber })}
				/></label
			>
		</div>
		<small
			>Depth slows travel and blocks vehicles above their demo threshold. Rainfall is a separate
			scenario value.</small
		>{/if}
	<label class="inline-check flex items-center gap-2"
		><input
			class="checkbox checkbox-primary"
			type="checkbox"
			checked={zone.enabled}
			onchange={(e) => update({ enabled: e.currentTarget.checked })}
		/>Area enabled</label
	>
</section>
