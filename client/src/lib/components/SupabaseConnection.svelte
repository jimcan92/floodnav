<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import {
		type SupabaseConfig,
		validateSupabaseConfig,
		saveSupabaseConfig,
		clearSupabaseConfig,
		loadSupabaseConfig
	} from '$lib/services/supabaseConfig';
	import { fetchSensorReadings } from '$lib/services/sensorService';
	let {
		config,
		fallback,
		onConnect
	}: {
		config: SupabaseConfig;
		fallback: SupabaseConfig;
		onConnect: (config: SupabaseConfig) => void;
	} = $props();
	let expanded = $state(untrack(() => !config.url || !config.key));
	let url = $state(''),
		key = $state(''),
		busy = $state(false),
		message = $state('');
	$effect(() => {
		url = config.url;
		key = config.key;
	});
	let controller: AbortController | undefined;
	onDestroy(() => controller?.abort());
	async function connect(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		let next: SupabaseConfig;
		try {
			next = validateSupabaseConfig({ url, key });
		} catch (e) {
			message = (e as Error).message;
			return;
		}
		const request = new AbortController();
		controller = request;
		const timeout = setTimeout(() => request.abort(), 8000);
		busy = true;
		try {
			const rows = await fetchSensorReadings(next.url, next.key, request.signal);
			if (request.signal.aborted) return;
			let saved = true;
			try {
				saveSupabaseConfig(next);
			} catch {
				saved = false;
			}
			onConnect(next);
			message = `Connected: ${rows.length} sensors found. ${saved ? 'Public connection settings saved in this browser.' : 'Settings apply to this session only; storage unavailable.'}`;
		} catch (e) {
			message = request.signal.aborted
				? 'Connection timed out or cancelled. Existing connection retained.'
				: (e as Error).message;
		} finally {
			clearTimeout(timeout);
			busy = false;
		}
	}
</script>

<details bind:open={expanded} class="notice">
	<summary class="cursor-pointer font-semibold">Supabase connection</summary>
	<form onsubmit={connect} class="mt-3 space-y-3">
		<label
			>Project URL<input
				aria-label="Supabase project URL"
				type="url"
				required
				bind:value={url}
				disabled={busy}
				placeholder="https://your-project.supabase.co"
			/></label
		>
		<label
			>Publishable key<input
				aria-label="Supabase publishable key"
				type="password"
				required
				autocomplete="off"
				bind:value={key}
				disabled={busy}
				placeholder="sb_publishable_..."
			/></label
		>
		<p>
			Public key only. Requires the FloodNav tables and latest_flood_readings view. No service-role
			or device tokens here.
		</p>
		<button type="submit" disabled={busy}
			>{busy ? 'Testing connection…' : 'Test and save connection'}</button
		>
		<button
			type="button"
			disabled={busy}
			onclick={() => {
				try {
					clearSupabaseConfig();
					const defaults = loadSupabaseConfig(fallback);
					onConnect(defaults);
					message = 'Saved settings removed; using environment defaults.';
				} catch {
					message = 'Browser storage could not be cleared.';
				}
			}}>Use environment defaults</button
		>
		{#if message}<p role="status">{message}</p>{/if}
	</form>
</details>
