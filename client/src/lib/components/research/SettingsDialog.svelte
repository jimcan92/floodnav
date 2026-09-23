<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import ThemeController from '$lib/components/ThemeController.svelte';
	import type { ResearchState } from '$lib/states/research/trip.svelte';
	import { speechService } from '$lib/services/speechService';

	let { research, onVehicle }: { research: ResearchState; onVehicle: () => void } = $props();
	let settingsDialog: HTMLDialogElement;
	export function open() {
		settingsDialog.showModal();
	}
</script>

<!-- Settings Modal Dialog -->
<dialog bind:this={settingsDialog} aria-label="Settings and flood options" class="modal">
	<div class="modal-box space-y-4">
		<div class="mb-4 flex items-center justify-between border-b border-base-300 pb-3">
			<h2 class="flex items-center gap-2 text-xl font-bold text-base-content">
				<span><Icon name="settings" /></span> FloodNav Settings
			</h2>
			<button
				type="button"
				class="btn rounded-lg p-1.5 text-base-content/70 hover:bg-base-200 hover:text-base-content"
				onclick={() => settingsDialog.close()}
				aria-label="Close settings"
			>
				<Icon name="close" />
			</button>
		</div>

		<div class="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
			<div class="flex items-center justify-between"><span>Theme</span><ThemeController /></div>
			<!-- Navigation & Voice Guidance -->
			<div class="space-y-3">
				<h3 class="text-xs font-semibold tracking-wider text-primary uppercase">
					Navigation Preferences
				</h3>
				<div class="space-y-2 rounded-xl border border-base-300/60 bg-base-200/50 p-3 text-xs">
					<div class="flex items-center justify-between">
						<span class="text-base-content/70">Vehicle Profile:</span>
						<button
							type="button"
							class="btn font-medium text-primary hover:underline"
							onclick={() => {
								settingsDialog.close();
								onVehicle();
							}}
						>
							{research.trip.vehicle.title} (Change)
						</button>
					</div>
					<p class="text-[11px] text-base-content/70">
						Threshold: {research.trip.vehicle.maxSafeWaterDepthCm} cm safe water clearance.
					</p>
				</div>
			</div>

			<!-- Voice & Audio Configuration -->
			<div class="space-y-2 border-t border-base-300 pt-3">
				<h3 class="text-xs font-semibold tracking-wider text-primary uppercase">Voice Guidance</h3>
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
			</div>
		</div>

		<div class="mt-6 flex justify-end border-t border-base-300 pt-4">
			<button
				class="btn rounded-xl bg-primary px-5 py-2 font-medium text-base-content hover:bg-primary"
				onclick={() => settingsDialog.close()}
			>
				Done
			</button>
		</div>
	</div>
</dialog>
