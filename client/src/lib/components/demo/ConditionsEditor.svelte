<script lang="ts">
	import ZoneList from './ZoneList.svelte';
	import ZoneEditor from './ZoneEditor.svelte';
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
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

<div class="controller-heading space-y-2 py-4">
	<div class="eyebrow text-xs font-semibold tracking-wide text-primary">SCENARIO CONTROL</div>
	<h1>Change the journey.</h1>
	<p>
		{localOnly
			? 'Offline demo changes affect this device only.'
			: 'Applied traffic and flood changes affect everyone’s routes.'}
	</p>
</div>
{#if dirty && simulation.revision !== version}
	<div class="conflict-review alert block space-y-2 alert-warning" role="status">
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
			}}>Keep my draft after review</button
		>
		>
	</div>
{/if}
<form
	class="conditions-form space-y-4"
	onsubmit={(e) => {
		e.preventDefault();
		void apply();
	}}
>
	<section class="condition-section card gap-3 border border-base-300 bg-base-200 p-3">
		<div class="section-heading flex items-center justify-between gap-3">
			<span class="section-symbol traffic-symbol rounded-box p-2 text-warning"
				><Icon name="traffic" /></span
			>
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
		<div class="mode-note flex flex-wrap justify-between gap-2 text-xs text-base-content/70">
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
	<section class="condition-section card gap-3 border border-base-300 bg-base-200 p-3">
		<div class="section-heading flex items-center justify-between gap-3">
			<span class="section-symbol flood-symbol rounded-box p-2 text-info"><Icon name="rain" /></span
			>
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
		<div class="mode-note flex flex-wrap justify-between gap-2 text-xs text-base-content/70">
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
	<ZoneList
		zones={draft.zones}
		{editing}
		onselect={(id) => (editing = id)}
		onclear={() => {
			draft.zones = [];
			editing = null;
			changed();
		}}
		onremove={(id) => {
			draft.zones = draft.zones.filter((z) => z.id !== id);
			changed();
		}}
	/>
	{#if zone}<ZoneEditor {zone} {update} onclose={() => (editing = null)} />{/if}
	<div class="publish-bar flex flex-col gap-2">
		<button
			class="primary-button btn btn-primary"
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
				class="text-button btn btn-ghost btn-sm"
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
<details class="preset-section rounded-box border border-base-300 p-3">
	<summary>Ready-made demo scenarios</summary>
	<p>
		{localOnly
			? 'Presets change this device’s offline demo only.'
			: 'Presets change shared conditions near Fuente → SM City.'} Trips are not reset.
	</p>
	<div class="preset-buttons mt-3 flex flex-wrap gap-2">
		{#each [['dry', 'Dry roads'], ['bypass', 'Flood + bypass'], ['blocked', 'All blocked']] as [id, title]}<button
				class="btn"
				disabled={saving || simulation.revision !== version}
				onclick={() => void apply(id as DemoScenario)}>{title}</button
			>{/each}
	</div>
</details>
