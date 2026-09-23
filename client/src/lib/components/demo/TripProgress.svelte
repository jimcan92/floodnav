<script lang="ts">
	import { formatTravelTime } from '$lib/services/demoSimulation';
	import {
		arrived,
		blocked,
		demo,
		editable,
		gpsTravel,
		liveUnavailable,
		remainingMeters,
		remainingSeconds,
		status
	} from '$lib/states/demo.svelte';
	import Icon from './Icon.svelte';

	let {
		onToggleMute,
		onTogglePlaying,
		onStop
	}: {
		onToggleMute: () => void;
		onTogglePlaying: () => void;
		onStop: () => void;
	} = $props();

	const canResume = $derived(editable && (gpsTravel || (!blocked && !demo.busy && !liveUnavailable)));
</script>

<section
	class="trip-card card fixed bottom-6 left-1/2 z-[500] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 border border-base-300 bg-base-100 shadow-xl"
	aria-label="Trip progress"
>
	<div class="card-body p-4">
		<strong
			>{arrived
				? 'Arrived'
				: gpsTravel && (demo.offRoute || demo.busy || !!demo.gpsMessage || !demo.gpsAccuracy)
					? 'Updating ETA…'
					: blocked
						? 'Blocked — ETA unavailable'
						: formatTravelTime(remainingSeconds)}</strong
		>
		<span
			>{(remainingMeters / 1000).toFixed(1)} km remaining <span class="trip-separator">·</span>
			{status}</span
		>
		<small
			>{((demo.completedMeters + demo.progress) / 1000).toFixed(2)} km traveled · {gpsTravel
				? `Live GPS · ±${Math.round(demo.gpsAccuracy)} m`
				: `${demo.playbackSpeed}× playback`}</small
		>
	</div>
	<div class="trip-actions card-actions justify-end p-4 pt-0">
		<button
			class="icon-button btn btn-circle btn-ghost btn-sm"
			aria-label={demo.muted ? 'Unmute voice' : 'Mute voice'}
			aria-pressed={demo.muted}
			onclick={onToggleMute}><Icon name="sound" /></button
		><button
			class="primary-button btn btn-primary btn-sm"
			disabled={arrived || !canResume}
			onclick={onTogglePlaying}
			><Icon name={demo.playing ? 'pause' : 'play'} size={17} />{demo.playing ? 'Pause' : 'Resume'}</button
		><button class="icon-button btn btn-circle btn-ghost btn-sm" aria-label="End trip" onclick={onStop}
			><Icon name="close" /></button
		>
	</div>
</section>
