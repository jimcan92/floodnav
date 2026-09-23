<script lang="ts">
	import type { ResearchState } from '$lib/states/research/trip.svelte';
	import RainfallPanel from '$lib/components/RainfallPanel.svelte';
	import SupabaseConnection from '$lib/components/SupabaseConnection.svelte';

	let { research }: { research: ResearchState } = $props();
</script>

<!-- Flood Source & Hazard Assessment Engine -->
{#if research.trip.mode !== 'demo'}
	<div class="space-y-2 rounded-xl border border-base-300/60 bg-base-200/40 p-3 text-xs">
		<div class="flex items-center justify-between">
			<span class="text-[11px] font-semibold tracking-wider text-primary uppercase"
				>Flood & Hazard Engine</span
			>
			<span class="relative flex h-2 w-2">
				<span
					class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"
				></span>
				<span class="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
			</span>
		</div>
		<label class="fieldset-label flex flex-col items-start gap-1 whitespace-normal">
			Flood source
			<select
				class="select w-full"
				aria-label="Flood source"
				value={research.trip.floodSource}
				onchange={(e) => {
					research.resetInput();
					research.trip.floodSource = e.currentTarget.value as 'mock' | 'supabase' | 'rainfall';
				}}
			>
				<option value="rainfall">Rainfall + MGB susceptibility</option>
				<option value="mock">Simulated floods</option>
				<option value="supabase" disabled>Supabase ESP sensors</option>
			</select>
		</label>
		<p class="text-xs text-base-content/70">
			ESP sensors: Temporarily unavailable — rainfall and MGB susceptibility are used for this
			research phase.
		</p>
		{#if research.rainfall}
			<RainfallPanel
				roads={research.trip.roads}
				onAssessment={(value) => (research.trip.assessment = value)}
				onError={(err) => (research.trip.assessmentError = err)}
			/>
		{/if}
		{#if research.live}
			<section class="notice mt-2 alert block alert-soft" aria-label="Sensor feed status">
				<SupabaseConnection
					config={research.trip.config}
					fallback={research.fallback}
					onConnect={research.connect}
				/>
				<strong>ESP sensor feed</strong>
				<p>
					{research.freshCount}/{research.trip.rows.length} sensors have fresh readings · refresh every
					15 seconds
				</p>
				{#if research.trip.sensorLoading}<p>Checking readings…</p>{/if}
				{#if research.trip.sensorError}<p role="alert">{research.trip.sensorError}</p>{/if}
				{#if !research.sensorsUsable}
					<p>
						Sensor data missing, stale (over 5 minutes), or unavailable. Simulation is paused;
						absence of readings is not a dry-road report.
					</p>
				{/if}
				<button class="btn" onclick={() => research.trip.refresh++}>Refresh sensors</button>
				<ul class="mt-2 space-y-1.5" aria-label="Sensor readings">
					{#each research.trip.rows as sensor (sensor.sensor_id)}
						<li>
							<strong>{sensor.name}</strong>: {sensor.water_depth_cm === null
								? 'No reading'
								: `${sensor.water_depth_cm} cm`}
							<div>
								{sensor.affected_road} · {sensor.observed_at
									? new Date(sensor.observed_at).toLocaleString()
									: 'Awaiting first reading'}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}

{#if research.trip.notice}<p role="status" class="notice alert block alert-soft">
		{research.trip.notice}
	</p>{/if}
{#if research.trip.status === 'loading'}<p
		role="status"
		class="notice alert block alert-soft text-primary"
	>
		Loading road routes…
	</p>{/if}
{#if research.trip.status === 'error'}
	<div
		role="alert"
		class="notice alert block space-y-2 border-error/50 bg-error/30 alert-soft text-error"
	>
		<p>{research.trip.error}</p>
		<div class="flex gap-2">
			<button
				class="btn"
				onclick={() => {
					research.resetInput();
					research.trip.retry++;
				}}>Retry routing</button
			>
			<button class="btn" onclick={() => research.changeMode('demo')}>Use Demo scenarios</button>
		</div>
	</div>
{/if}
