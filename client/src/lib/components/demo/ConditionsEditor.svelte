<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { demoId } from '$lib/services/demoId';
	import type { Conditions, SimulationState, SimulationZone } from '$lib/types/demo';
	import type { Coordinate, DemoScenario } from '$lib/types/navigation';
	import { cloneJson } from '$lib/utils/clone';
	let {
		simulation,
		localOnly = false,
		picked,
		selectedZone,
		onpick,
		onapply,
		oncancelpick,
		onpreview
	}: {
		simulation: SimulationState;
		localOnly?: boolean;
		picked: { kind: 'traffic' | 'flood'; center: Coordinate; token: number } | null;
		selectedZone: string | null;
		onpick: (kind: 'traffic' | 'flood') => void;
		oncancelpick: () => void;
		onpreview: (zones: SimulationZone[] | null) => void;
		onapply: (conditions: Conditions, revision: number, preset?: DemoScenario) => Promise<boolean>;
	} = $props();
	const clone = (value: Conditions): Conditions => cloneJson(value);
	let draft = $state<Conditions>(untrack(() => clone(simulation.conditions))),
		version = $state(untrack(() => simulation.revision)),
		dirty = $state(false),
		saving = $state(false),
		message = $state('');
	let editing = $state<string | null>(null),
		lastPick = 0,
		lastSelection: string | null = null;
	const zone = $derived(draft.zones.find((z) => z.id === editing));
	$effect(() => {
		onpreview(
			dirty
				? clone(draft).zones.filter(
						(z) =>
							Number.isFinite(z.radiusMeters) &&
							z.radiusMeters >= 10 &&
							(z.kind === 'traffic' ? draft.trafficSimulation : draft.floodSimulation)
					)
				: null
		);
	});
	$effect(() => {
		if (simulation.revision !== version && !dirty) {
			draft = clone(simulation.conditions);
			version = simulation.revision;
		}
	});
	$effect(() => {
		if (picked && picked.token !== lastPick) {
			lastPick = picked.token;
			const z: SimulationZone = {
				id: demoId(),
				kind: picked.kind,
				center: picked.center,
				name: picked.kind === 'traffic' ? 'Traffic area' : 'Flood area',
				radiusMeters: picked.kind === 'traffic' ? 150 : 100,
				enabled: true,
				level: 'moderate',
				rainMmH: 10,
				depthCm: 30
			};
			draft.zones.push(z);
			editing = z.id;
			dirty = true;
		}
	});
	$effect(() => {
		if (selectedZone && selectedZone !== lastSelection) {
			lastSelection = selectedZone;
			editing = selectedZone;
		}
	});
	function changed() {
		dirty = true;
		message = '';
	}
	function update(patch: Partial<SimulationZone>) {
		if (!zone) return;
		draft.zones = draft.zones.map((z) => (z.id === editing ? { ...z, ...patch } : z));
		changed();
	}
	async function apply(preset?: DemoScenario) {
		saving = true;
		message = '';
		const ok = await onapply(draft, version, preset);
		saving = false;
		if (ok) {
			dirty = false;
			draft = clone(simulation.conditions);
			version = simulation.revision;
			message = localOnly
				? 'Applied on this device only'
				: preset
					? 'Preset published to everyone. Trips are unchanged.'
					: 'Published to everyone';
		} else {
			message =
				simulation.revision !== version
					? 'Someone changed the shared conditions. Your draft is preserved; review the latest settings below.'
					: 'Changes were not saved. Retry when the connection is available.';
		}
	}
</script>

<div class="controller-heading">
	<div class="eyebrow">SCENARIO CONTROL</div>
	<h1>Change the journey.</h1>
	<p>
		{localOnly
			? 'Offline demo changes affect this device only.'
			: 'Applied traffic and flood changes affect everyone’s routes.'}
	</p>
</div>
{#if dirty && simulation.revision !== version}
	<div class="conflict-review" role="status">
		<strong>Shared conditions changed</strong>
		<p>
			Latest: traffic simulation {simulation.conditions.trafficSimulation ? 'on' : 'off'}, flood
			simulation {simulation.conditions.floodSimulation ? 'on' : 'off'}.
		</p>
		<ul>
			{#each simulation.conditions.zones as z}<li>
					{z.name}: {z.kind === 'flood' ? `${z.depthCm} cm` : z.level}, {z.radiusMeters} m{z.enabled
						? ''
						: ' (disabled)'}
				</li>{/each}
		</ul>
		<button
			type="button"
			class="text-button btn btn-ghost btn-sm"
			onclick={() => {
				version = simulation.revision;
				message = 'Latest settings reviewed. Apply changes to publish your draft.';
			}}>Keep my draft after review</button>
		>
	</div>
{/if}
<form
	class="conditions-form"
	onsubmit={(e) => {
		e.preventDefault();
		void apply();
	}}
>
	<section class="condition-section">
		<div class="section-heading">
			<span class="section-symbol traffic-symbol"><Icon name="traffic" /></span>
			<div>
				<h2>Traffic</h2>
				<small>{draft.trafficSimulation ? 'Custom traffic areas' : 'Live · TomTom'}</small>
			</div>
			<input
				type="checkbox"
				class="toggle toggle-primary"
				aria-label="Traffic simulation"
				disabled={localOnly}
				bind:checked={draft.trafficSimulation}
				onchange={changed}
			/>
		</div>
		<div class="mode-note">
			Simulation {draft.trafficSimulation ? 'on' : 'off'}
			<span>{draft.trafficSimulation ? 'You control congestion' : 'Uses live traffic and ETA'}</span
			>
		</div>
		{#if draft.trafficSimulation}<button
				type="button"
				class="add-area btn btn-outline btn-sm"
				onclick={() => onpick('traffic')}><Icon name="plus" size={17} />Add traffic area</button
			>{/if}
	</section>
	<section class="condition-section">
		<div class="section-heading">
			<span class="section-symbol flood-symbol"><Icon name="rain" /></span>
			<div>
				<h2>Rainfall & flooding</h2>
				<small
					>{draft.floodSimulation ? 'Custom rainfall and depth' : 'Live · Rainfall + MGB'}</small
				>
			</div>
			<input
				type="checkbox"
				class="toggle toggle-primary"
				aria-label="Rainfall/Flood simulation"
				disabled={localOnly}
				bind:checked={draft.floodSimulation}
				onchange={changed}
			/>
		</div>
		<div class="mode-note">
			Simulation {draft.floodSimulation ? 'on' : 'off'}
			<span
				>{draft.floodSimulation
					? 'You control flood zones'
					: 'Estimated exposure, not measured depth'}</span
			>
		</div>
		{#if draft.floodSimulation}<button
				type="button"
				class="add-area btn btn-outline btn-sm"
				onclick={() => onpick('flood')}><Icon name="plus" size={17} />Add flood area</button
			>{/if}
	</section>
	<section class="zone-section">
		<div class="section-title">
			<h2>Scenario areas <span>{draft.zones.length}</span></h2>
			{#if draft.zones.length}<button
					type="button"
					class="text-button btn btn-ghost btn-xs"
					onclick={() => {
						draft.zones = [];
						editing = null;
						changed();
					}}>Clear all</button>
				>{/if}
		</div>
		{#if !draft.zones.length}<div class="empty-zones">
				<Icon name="pin" size={26} />
				<p>No areas yet</p>
				<small>Add an area, then click the map to place it.</small>
			</div>{/if}
		{#each draft.zones as z (z.id)}<div class="zone-row" class:zone-selected={editing === z.id}>
				<button
					type="button"
					class="zone-select"
					onclick={() => (editing = editing === z.id ? null : z.id)}
					><span
						class:flood-symbol={z.kind === 'flood'}
						class:traffic-symbol={z.kind === 'traffic'}
						class="mini-symbol"
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
						draft.zones = draft.zones.filter((v) => v.id !== z.id);
						changed();
					}}><Icon name="trash" size={17} /></button
				>
			</div>{/each}
	</section>
	{#if zone}<section class="zone-editor" aria-label="Area editor">
			<div class="section-title">
				<h2>Edit {zone.kind} area</h2>
				<button
					type="button"
					class="icon-button"
					aria-label="Close area editor"
					onclick={() => (editing = null)}><Icon name="close" size={17} /></button
				>
			</div>
			<label
				>Area name<input
					required
					maxlength="100"
					value={zone.name}
					oninput={(e) => update({ name: e.currentTarget.value })}
				/></label
			>
			<label
				>Radius (m)<input
					type="number"
					min="10"
					max="1000"
					required
					value={zone.radiusMeters}
					oninput={(e) => update({ radiusMeters: e.currentTarget.valueAsNumber })}
				/></label
			>
			{#if zone.kind === 'traffic'}<label
					>Traffic level<select
						value={zone.level}
						onchange={(e) => update({ level: e.currentTarget.value as SimulationZone['level'] })}
						><option value="light">Light</option><option value="moderate">Moderate</option><option
							value="heavy">Heavy</option
						></select
					></label
				>
			{:else}<div class="field-pair">
					<label
						>Flood depth (cm)<input
							type="number"
							min="0"
							max="200"
							required
							value={zone.depthCm}
							oninput={(e) => update({ depthCm: e.currentTarget.valueAsNumber })}
						/></label
					><label
						>Rainfall (mm/h)<input
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
			<label class="inline-check"
				><input
					type="checkbox"
					checked={zone.enabled}
					onchange={(e) => update({ enabled: e.currentTarget.checked })}
				/>Area enabled</label
			>
		</section>{/if}
	<div class="publish-bar">
		<button
			class="primary-button"
			disabled={saving || !dirty || simulation.revision !== version}
			type="submit"
			>{saving ? 'Publishing…' : 'Apply changes'}<Icon name="arrow" size={17} /></button
		><small role="status"
			>{message ||
				(dirty
					? 'Unpublished changes'
					: `${localOnly ? 'Local demo' : 'Shared conditions'} · revision ${simulation.revision}`)}</small
		>{#if dirty}<button
				type="button"
				class="text-button"
				onclick={() => {
					draft = clone(simulation.conditions);
					version = simulation.revision;
					dirty = false;
					editing = null;
					oncancelpick();
				}}>Discard changes</button
			>{/if}
	</div>
</form>
<details class="preset-section">
	<summary>Ready-made demo scenarios</summary>
	<p>
		{localOnly
			? 'Presets change this device’s offline demo only.'
			: 'Presets change shared conditions near Fuente → SM City.'} Trips are not reset.
	</p>
	<div class="preset-buttons">
		{#each [['dry', 'Dry roads'], ['bypass', 'Flood + bypass'], ['blocked', 'All blocked']] as [id, title]}<button
				disabled={saving || simulation.revision !== version}
				onclick={() => void apply(id as DemoScenario)}>{title}</button
			>{/each}
	</div>
</details>
