<script lang="ts">
	import { onMount } from 'svelte';
	import { LOGGING_KEY, loadLoggingPreference, sampleRate } from '$lib/services/rainfallAssessment';
	import type { RoadRoute } from '$lib/services/routingService';
	import type { ExposureAssessment } from '$lib/types/rainfall';
	let {
		roads,
		onAssessment,
		onError
	}: {
		roads: RoadRoute[];
		onAssessment: (result: ExposureAssessment | null) => void;
		onError?: (err: string) => void;
	} = $props();
	let ready = $state(false),
		loggingEnabled = $state(true),
		loading = $state(false),
		error = $state(''),
		storageNotice = $state('');
	let result = $state<ExposureAssessment | null>(null),
		refresh = $state(0),
		saveRetry = $state(0);
	let identity = '',
		assessmentId = '';
	let now = $state(Date.now());
	onMount(() => {
		try {
			loggingEnabled = loadLoggingPreference(localStorage);
		} catch {
			loggingEnabled = true;
		}
		ready = true;
		const timer = setInterval(() => {
			refresh++;
		}, 600000);
		const clock = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => {
			clearInterval(timer);
			clearInterval(clock);
		};
	});
	function toggle(enabled: boolean) {
		loggingEnabled = enabled;
		try {
			localStorage.setItem(LOGGING_KEY, String(enabled));
			storageNotice = '';
		} catch {
			storageNotice = 'Preference applies to this page only; browser storage is unavailable.';
		}
	}
	$effect(() => {
		if (!ready) return;
		const candidates = roads.map(({ key, polyline, distanceMeters, durationSeconds }) => ({
			key,
			polyline,
			distanceMeters,
			durationSeconds
		}));
		const requestIdentity = JSON.stringify({ roads: candidates, refresh });
		const enabled = loggingEnabled;
		void saveRetry;
		if (identity !== requestIdentity) {
			identity = requestIdentity;
			assessmentId = crypto.randomUUID();
		}
		const id = assessmentId;
		const controller = new AbortController();
		let disposed = false;
		result = null;
		error = '';
		onAssessment(null);
		if (!candidates.length) {
			loading = false;
			return;
		}
		loading = true;
		const timeout = setTimeout(() => controller.abort(), 120000);
		fetch('/api/assessments', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ roads: candidates, assessmentId: id, loggingEnabled: enabled }),
			signal: controller.signal
		})
			.then(async (response) => {
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Assessment unavailable.');
				if (!disposed) {
					result = data;
					onAssessment(data);
					onError?.('');
				}
			})
			.catch((reason) => {
				if (!disposed) {
					error = controller.signal.aborted
						? 'Assessment timed out. Retry weather assessment.'
						: reason instanceof Error
							? reason.message
							: 'Assessment unavailable.';
					onError?.(error);
				}
			})
			.finally(() => {
				clearTimeout(timeout);
				if (!disposed) loading = false;
			});
		return () => {
			disposed = true;
			clearTimeout(timeout);
			controller.abort();
		};
	});
	const issues = $derived(
		result
			? [...new Set([...result.weather.errors, ...result.routes.flatMap((r) => r.reasons)])]
			: []
	);
	const expired = $derived(
		!!result && result.weather.samples.some((sample) => sampleRate(sample, now) === null)
	);
</script>

<section class="notice space-y-3" aria-label="Rainfall and research settings">
	<h2 class="font-bold text-sky-200">Rainfall + MGB susceptibility</h2>
	<p class="text-xs">
		Experimental exposure ranking, not a flood-depth prediction or road-safety assessment. Current
		rain and 3-hour forecasts have different time resolution.
	</p>
	<label class="flex items-center gap-3">
		<input
			type="checkbox"
			role="switch"
			aria-label="Research data logging"
			checked={loggingEnabled}
			disabled={!ready}
			onchange={(event) => toggle(event.currentTarget.checked)}
			class="h-5 w-5 accent-sky-400"
		/>
		Research data logging
	</label>
	<p class="text-xs">
		Saves weather data and route assessments for research while you use the app.
	</p>
	<p role="status">
		{!loggingEnabled
			? 'Logging disabled'
			: result?.loggingStatus === 'failed'
				? 'Research log not saved'
				: 'Logging enabled'}
	</p>
	{#if loggingEnabled && result?.loggingStatus === 'failed'}
		<p class="text-xs">
			Check the server Supabase credential and research migration. Route display remains available.
		</p>
		<button onclick={() => saveRetry++} disabled={loading}>Retry research save</button>
	{/if}
	{#if storageNotice}<p role="status">{storageNotice}</p>{/if}
	<p class="text-xs text-slate-400">
		This browser only. Disabling keeps existing records; a save already in progress may finish.
	</p>
	<button onclick={() => refresh++} disabled={loading}
		>{loading ? 'Checking weather and susceptibility…' : 'Refresh weather assessment'}</button
	>
	{#if error}<p role="alert">Assessment unavailable. {error}</p>{/if}
	{#if expired}<p role="status">
			Assessment unavailable — weather or forecast is missing or stale. Previous scores below are
			historical.
		</p>{/if}
	{#if issues.length}<details>
			<summary>Assessment unavailable — data details</summary>
			<ul>
				{#each issues as issue}<li>{issue}</li>{/each}
			</ul>
		</details>{/if}
	{#if result}
		<p class="text-xs">
			Assessed {new Date(result.assessedAt).toLocaleString()} · {result.modelVersion}
		</p>
		<details>
			<summary>MGB susceptibility legend</summary>
			<p>Low · Moderate · High · Very High. Blank sections are unclassified, not confirmed dry.</p>
			<a href={result.hazards.source} target="_blank" rel="noreferrer">MGB source metadata</a>
			<p>Retrieved {new Date(result.hazards.fetchedAt).toLocaleString()}</p>
		</details>
		{#each result.weather.samples as sample (sample.cell)}
			<details>
				<summary
					>{sample.coordinate[0].toFixed(3)}, {sample.coordinate[1].toFixed(3)}: {sample.rainMmH} mm/h</summary
				>
				<p class="text-xs">
					OpenWeather · observed {new Date(sample.observedAt).toLocaleString()}{now -
						Date.parse(sample.observedAt) >
					1800000
						? ' · STALE'
						: ''}
				</p>
				<p class="text-xs">Sample grid center; not a street-level measurement.</p>
				<table class="w-full text-xs">
					<caption>Upcoming 24 hours · forecast intervals</caption><thead
						><tr><th>Interval end</th><th>mm/3h</th><th>Chance</th></tr></thead
					><tbody>
						{#each sample.forecast.filter((f) => Date.parse(f.endsAt) > now && Date.parse(f.endsAt) <= now + 86400000) as interval}
							<tr
								><td
									>{new Date(interval.endsAt).toLocaleTimeString([], {
										hour: '2-digit',
										minute: '2-digit'
									})}</td
								><td>{interval.rainMm3h}</td><td>{Math.round(interval.probability * 100)}%</td></tr
							>
						{/each}
					</tbody>
				</table>
			</details>
		{/each}
		{#each result.routes as route (route.key)}
			<details>
				<summary
					>{route.key}: {route.score === null
						? 'Assessment unavailable'
						: `exposure ${route.score.toFixed(2)}`}</summary
				>
				<p>Coverage {(route.coverage * 100).toFixed(1)}%</p>
				{#each Object.entries(route.distanceByClass) as [label, distance]}<p class="text-xs">
						{label}: {distance.toFixed(2)} km
					</p>{/each}
			</details>
		{/each}
	{/if}
</section>
