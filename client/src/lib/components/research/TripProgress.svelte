<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { ResearchState } from '$lib/states/research/trip.svelte';

	import { speechService } from '$lib/services/speechService';

	let { research }: { research: ResearchState } = $props();
</script>

<!-- Waze-Style Navigation Maneuver & Trip Progress -->
<section aria-label="Navigation progress" class="notice alert block space-y-3 alert-soft">
	<div class="flex items-start gap-3">
		<div class="maneuver-icon-badge rounded-box bg-primary/10 p-3 text-primary" aria-hidden="true">
			{#if research.arrived}
				<Icon name="flag" />
			{:else if research.nextStep?.instruction.toLowerCase().includes('left')}
				<Icon name="left" />
			{:else if research.nextStep?.instruction.toLowerCase().includes('right')}
				<Icon name="right" />
			{:else if research.nextStep?.instruction
				.toLowerCase()
				.includes('straight') || research.nextStep?.instruction.toLowerCase().includes('continue')}
				<Icon name="arrow" />
			{:else}
				<Icon name="forward" />
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<strong class="block text-sm leading-snug font-bold text-base-content">
				{research.arrived
					? 'Arrived at destination'
					: research.nextStep?.instruction || 'Select a road route'}
			</strong>
			<p class="mt-0.5 text-xs text-base-content/70">
				{Math.round(research.remaining)} m remaining · {Math.ceil(research.remainingMinutes)} min
			</p>
			{#if research.nextStep && !research.arrived}
				<p class="text-xs font-medium text-primary">
					Next maneuver in {Math.round(
						Math.max(0, research.nextStep.progressMeters - research.trip.progress)
					)} m
				</p>
			{/if}
		</div>
	</div>
	<progress
		aria-label="Trip progress"
		value={research.trip.progress}
		max={research.total || 1}
		class="progress h-2 w-full overflow-hidden rounded-full progress-primary"
	></progress>
</section>

<!-- Drive Actions -->
<div class="flex gap-2">
	<button
		class="drive-btn-primary btn flex-1 btn-primary"
		class:btn-warning={research.trip.playing}
		disabled={!research.canDrive || research.arrived}
		onclick={() => (research.trip.playing = !research.trip.playing)}
	>
		{research.trip.playing ? 'Pause simulation' : 'Start / resume simulation'}
	</button>
	<button
		class="btn px-4"
		onclick={() => {
			research.reset();
			research.warnings.reset();
		}}
	>
		Reset trip
	</button>
</div>

<!-- Voice Audio Controls -->
<div class="flex gap-2">
	<button
		class="btn flex-1"
		onclick={() => {
			research.trip.muted = !research.trip.muted;
			speechService.setMuted(research.trip.muted);
		}}
	>
		{research.trip.muted ? 'Unmute voice' : 'Mute voice'}
	</button>
	<button
		class="btn flex-1"
		onclick={() => {
			if (!speechService.testVoice())
				research.trip.notice = 'Speech synthesis is unavailable in this browser.';
		}}
	>
		Test voice
	</button>
</div>
