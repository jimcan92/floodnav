<script lang="ts">
	import { formatTravelTime } from '$lib/services/demoSimulation';
	import Icon from './Icon.svelte';

	let {
		arrived,
		gpsTravel,
		offRoute,
		busy,
		gpsMessage,
		blocked,
		remainingSeconds,
		remainingMeters,
		status,
		completedMeters,
		progress,
		gpsAccuracy,
		playbackSpeed,
		playing,
		muted,
		canResume,
		onToggleMute,
		onTogglePlaying,
		onStop
	}: {
		arrived: boolean;
		gpsTravel: boolean;
		offRoute: boolean;
		busy: boolean;
		gpsMessage: string;
		blocked: boolean;
		remainingSeconds: number;
		remainingMeters: number;
		status: string;
		completedMeters: number;
		progress: number;
		gpsAccuracy: number;
		playbackSpeed: number;
		playing: boolean;
		muted: boolean;
		canResume: boolean;
		onToggleMute: () => void;
		onTogglePlaying: () => void;
		onStop: () => void;
	} = $props();
</script>

<section
	class="trip-card card fixed bottom-6 left-1/2 z-[500] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 border border-base-300 bg-base-100 shadow-xl"
	aria-label="Trip progress"
>
	<div>
		<strong
			>{arrived
				? 'Arrived'
				: gpsTravel && (offRoute || busy || !!gpsMessage || !gpsAccuracy)
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
			>{((completedMeters + progress) / 1000).toFixed(2)} km traveled · {gpsTravel
				? `Live GPS · ±${Math.round(gpsAccuracy)} m`
				: `${playbackSpeed}× playback`}</small
		>
	</div>
	<div class="trip-actions">
		<button
			class="icon-button"
			aria-label={muted ? 'Unmute voice' : 'Mute voice'}
			aria-pressed={muted}
			onclick={onToggleMute}><Icon name="sound" /></button
		><button class="primary-button" disabled={arrived || !canResume} onclick={onTogglePlaying}
			><Icon name={playing ? 'pause' : 'play'} size={17} />{playing ? 'Pause' : 'Resume'}</button
		><button class="icon-button" aria-label="End trip" onclick={onStop}
			><Icon name="close" /></button
		>
	</div>
</section>
