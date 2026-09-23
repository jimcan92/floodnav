<script lang="ts">
	import Icon from './Icon.svelte';
	import { formatTravelTime } from '$lib/services/demoSimulation';
	import type { RoadRoute } from '$lib/services/routingService';
	let { entries, selected, disabled=false, busy=false, recommendedKey, floodSimulation, onselect }: {
		entries: {road:RoadRoute;blocked:boolean;seconds:number}[]; selected:string;
		disabled?:boolean;busy?:boolean;recommendedKey?:string|null;floodSimulation:boolean;
		onselect:(road:RoadRoute)=>void;
	}=$props();
</script>
<div class="route-results-title"><span>{busy?'Finding your route…':'Route options'}</span></div>
<div class="route-results-content">
	{#each entries as result, i (result.road.key)}
		<button class="demo-route-card" class:chosen={selected===result.road.key} {disabled} aria-pressed={selected===result.road.key} onclick={()=>onselect(result.road)}>
			<span class="route-card-icon"><Icon name="car" /></span>
			<span class="route-card-main"><strong>{result.blocked?'Blocked — ETA unavailable':formatTravelTime(result.seconds)} <small>{(result.road.distanceMeters/1000).toFixed(1)} km</small></strong>
				<span>{!floodSimulation&&recommendedKey===result.road.key?'Lower estimated rainfall exposure':i===0&&!result.blocked?'Recommended route':'Alternative route'}</span>
				<small class:blocked-text={result.blocked}>{result.blocked?'Blocked by simulated flood':floodSimulation?'No blocking simulated flood':'Flood conditions unconfirmed'}</small>
			</span><span class="route-radio"></span>
		</button>
	{/each}
	{#if !entries.length&&!busy}<p class="quiet-text">Choose your starting point and destination.</p>{/if}
</div>
