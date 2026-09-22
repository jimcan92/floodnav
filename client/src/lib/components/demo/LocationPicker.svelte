<script lang="ts">
	import Icon from './Icon.svelte';
	import { PRESET_ORIGINS, PRESET_DESTINATIONS } from '$lib/data/mockFloodData';
	import type { Waypoint } from '$lib/types/demo';
	let {
		label,
		value,
		onchoose,
		onpick,
		ongps,
		disabled = false
	}: {
		label: string;
		value: Waypoint;
		onchoose: (p: Waypoint) => void;
		onpick: () => void;
		ongps?: () => void;
		disabled?: boolean;
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

<div class="location-field">
	<label
		><span>{label}</span>
		<div class="location-input">
			<input
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
				placeholder="Search or choose on map"
			/><button
				class="icon-button"
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
	>
	{#if open && !disabled}
		<div class="location-results">
			<div class="result-heading">
				<span>Choose a place</span><button
					class="icon-button"
					aria-label="Close location picker"
					onclick={() => (open = false)}><Icon name="close" size={16} /></button
				>
			</div>
			<button
				class="location-result"
				onclick={() => {
					open = false;
					onpick();
				}}><Icon name="pin" /><span>Choose on map</span></button
			>
			{#if ongps}<button
					class="location-result"
					onclick={() => {
						open = false;
						ongps();
					}}><Icon name="target" /><span>Use my location</span></button
				>{/if}
			{#each suggestions as p}<button class="location-result" onclick={() => choose(p)}
					><Icon name="pin" size={17} /><span>{p.name}<small>{p.shortDescription}</small></span
					></button
				>{/each}
			{#if query.length >= 3}<button class="search-online" disabled={busy} onclick={search}
					>{busy ? 'Searching…' : `Search online for “${query}”`}</button
				>{/if}
			{#each results as p}<button class="location-result" onclick={() => choose(p)}
					><Icon name="search" size={17} /><span>{p.name}</span></button
				>{/each}
			{#if error}<p class="field-error" role="status">{error}</p>{/if}
			<small class="search-credit"
				>Online search © <a
					href="https://www.openstreetmap.org/copyright"
					target="_blank"
					rel="noreferrer">OpenStreetMap</a
				></small
			>
		</div>
	{/if}
</div>
