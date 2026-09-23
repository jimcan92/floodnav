<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { PRESET_DESTINATIONS, PRESET_ORIGINS } from '$lib/data/mockFloodData';
	import type { Waypoint } from '$lib/types/demo';
	let {
		label,
		value,
		onchoose,
		onpick,
		ongps,
		disabled = false,
		compact = false
	}: {
		label: string;
		value: Waypoint;
		onchoose: (p: Waypoint) => void;
		onpick: () => void;
		ongps?: () => void;
		disabled?: boolean;
		compact?: boolean;
	} = $props();
	const presets = [...PRESET_ORIGINS, ...PRESET_DESTINATIONS].filter(
		(p, i, all) => all.findIndex((q) => q.coordinate.toString() === p.coordinate.toString()) === i
	);
	let open = $state(false),
		query = $state(''),
		busy = $state(false),
		error = $state('');
	let results = $state<Waypoint[]>([]),
		generation = 0;
	const suggestions = $derived(
		presets.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
	);
	function choose(p: Waypoint) {
		generation++;
		onchoose({ name: p.name, coordinate: p.coordinate });
		open = false;
	}
	async function search() {
		if (query.trim().length < 3) {
			error = 'Enter at least 3 characters.';
			return;
		}
		const version = ++generation;
		busy = true;
		error = '';
		results = [];
		try {
			const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`);
			const data = await response.json();
			if (version !== generation) return;
			if (!response.ok) throw new Error(data.error);
			results = data;
			if (!results.length) error = 'No results. Try another name or choose on the map.';
		} catch (e) {
			if (version === generation) error = e instanceof Error ? e.message : 'Search unavailable.';
		} finally {
			if (version === generation) busy = false;
		}
	}
</script>

<div class="location-field form-control relative mb-3 min-w-0">
	<label class="input">
		<span class:sr-only={compact}>{label}</span>
		<svg class="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
			<g
				stroke-linejoin="round"
				stroke-linecap="round"
				stroke-width="2.5"
				fill="none"
				stroke="currentColor"
			>
				<circle cx="11" cy="11" r="8"></circle>
				<path d="m21 21-4.3-4.3"></path>
			</g>
		</svg>
		<input
			type="search"
			aria-label={label}
			required
			{disabled}
			value={open ? query : value.name}
			onfocus={() => {
				open = true;
				query = '';
				results = [];
				error = '';
			}}
			oninput={(e) => {
				generation++;
				busy = false;
				query = e.currentTarget.value;
				results = [];
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					void search();
				}
				if (e.key === 'Escape') open = false;
			}}
			placeholder={compact ? `Choose ${label.toLowerCase()}` : 'Search or choose on map'}
		/>
	</label>
	<!-- <label class="fieldset-label flex w-full min-w-0 flex-col items-start gap-1 whitespace-normal"
		><span class:sr-only={compact}>{label}</span>
		<div class="location-input join flex w-full min-w-0">
			<input
				class="input-bordered input join-item w-0 min-w-0 flex-1"
				aria-label={label}
				{disabled}
				value={open ? query : value.name}
				onfocus={() => {
					open = true;
					query = '';
					results = [];
					error = '';
				}}
				oninput={(e) => {
					generation++;
					busy = false;
					query = e.currentTarget.value;
					results = [];
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						void search();
					}
					if (e.key === 'Escape') open = false;
				}}
				placeholder={compact ? `Choose ${label.toLowerCase()}` : 'Search or choose on map'}
			/><button
				class="btn join-item btn-square shrink-0 btn-outline"
				aria-label={`Search ${label.toLowerCase()}`}
				{disabled}
				onclick={() => {
					if (!open) {
						open = true;
						query = '';
					} else void search();
				}}><Icon name="search" size={18} /></button
			>
		</div></label
	> -->
	{#if open && !disabled}
		<div
			class="location-results relative z-30 mt-2 flex max-h-72 w-full min-w-0 flex-col flex-nowrap gap-1 overflow-x-hidden overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
		>
			<div
				class="result-heading flex shrink-0 items-center justify-between gap-2 px-1 text-xs font-semibold text-base-content/60"
			>
				<span>Choose a place</span><button
					class="icon-button btn btn-square btn-ghost btn-sm"
					aria-label="Close location picker"
					onclick={() => (open = false)}><Icon name="close" size={16} /></button
				>
			</div>
			<button
				class="location-result btn h-auto min-h-10 w-full min-w-0 shrink-0 flex-nowrap justify-start gap-2 rounded-lg btn-ghost px-2 py-2 text-left font-normal whitespace-normal [&>svg]:shrink-0"
				onclick={() => {
					open = false;
					onpick();
				}}><Icon name="pin" /><span>Choose on map</span></button
			>
			{#if ongps}<button
					class="location-result btn h-auto min-h-10 w-full min-w-0 shrink-0 flex-nowrap justify-start gap-2 rounded-lg btn-ghost px-2 py-2 text-left font-normal whitespace-normal [&>svg]:shrink-0"
					onclick={() => {
						open = false;
						ongps();
					}}><Icon name="target" /><span>Use my location</span></button
				>{/if}
			{#each suggestions as p}<button
					class="location-result btn h-auto min-h-10 w-full min-w-0 shrink-0 flex-nowrap justify-start gap-2 rounded-lg btn-ghost px-2 py-2 text-left font-normal whitespace-normal [&>svg]:shrink-0"
					onclick={() => choose(p)}
					><Icon name="pin" size={17} /><span class="min-w-0 break-words"
						><span class="block text-sm font-medium">{p.name}</span><small
							class="mt-0.5 block text-xs text-base-content/60">{p.shortDescription}</small
						></span
					></button
				>{/each}
			{#if query.length >= 3}<button
					class="search-online btn h-auto min-h-10 w-full shrink-0 btn-soft py-2 whitespace-normal"
					disabled={busy}
					onclick={search}>{busy ? 'Searching…' : `Search online for “${query}”`}</button
				>{/if}
			{#each results as p}<button
					class="location-result btn h-auto min-h-10 w-full min-w-0 shrink-0 flex-nowrap justify-start gap-2 rounded-lg btn-ghost px-2 py-2 text-left font-normal whitespace-normal [&>svg]:shrink-0"
					onclick={() => choose(p)}
					><Icon name="search" size={17} /><span class="min-w-0 text-sm break-words">{p.name}</span
					></button
				>{/each}
			{#if error}<p class="field-error" role="status">{error}</p>{/if}
			<small
				class="search-credit block shrink-0 border-t border-base-300 px-1 pt-2 text-[10px] text-base-content/60"
				>Online search © <a
					href="https://www.openstreetmap.org/copyright"
					target="_blank"
					rel="noreferrer">OpenStreetMap</a
				></small
			>
		</div>
	{/if}
</div>
