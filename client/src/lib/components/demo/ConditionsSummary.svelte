<script lang="ts">
	import type { ObservedFloods } from '$lib/types/observedFlood';
	import { observationTime } from '$lib/services/observedFlood';
	let {observed,loading=false,offline=false,providerMessage='',onretry}: {observed:ObservedFloods|null;loading?:boolean;offline?:boolean;providerMessage?:string;onretry:()=>void}=$props();
	const latest=$derived(observed?.observations.map((o)=>o.observedAt).sort().at(-1));
</script>
<section class="conditions-card" aria-label="Flood and weather insights">
	<h2>Flood & weather insights</h2>
	<p>{providerMessage || 'Rainfall and traffic providers follow the selected simulation settings.'}</p>
</section>
<section class="conditions-card satellite-card" aria-label="Satellite flood observations">
	<div class="conditions-card-heading"><span class="satellite-dot"></span><h2>Satellite flood observations</h2></div>
	<strong>{offline?'Offline · dated context only':loading?'Checking satellite observations…':observed?.stale?'Provider unavailable · cached observations':observed?.status==='available'?latest?'Latest available observation':'No observations in the last 14 days':observed?.status==='unsupported'?'Outside supported area':'Satellite data unavailable'}</strong>
	{#if latest}<time datetime={latest}>{observationTime(latest)}</time>{/if}
	{#if observed?.status==='available'}
		<p>{observed.features.length?`${observed.features.reduce((sum,f)=>sum+f.geometry.coordinates.length,0)} mapped flood areas`:'No flood polygons in the available observations'} · Metro Cebu</p>
		{#if observed.coverage.totalPixels}<p>{Math.round(observed.coverage.observedPixels/observed.coverage.totalPixels*100)}% assessed coverage · {Math.round(observed.coverage.recentPixels/observed.coverage.totalPixels*100)}% within {observed.freshnessHours}h</p>{/if}
	{/if}
	<p>Satellite observations are not live street conditions. Excluded or unobserved areas remain unknown; water depth is unavailable.</p>
	{#if observed?.stale||observed?.status==='unavailable'||!observed}<button class="text-button" disabled={loading||offline} onclick={onretry}>Retry satellite data</button>{/if}
	<small>Copernicus CEMS · Sentinel-1 / GFM · <a href="https://extwiki.eodc.eu/GFM/PUM" target="_blank" rel="noreferrer">About the data</a></small>
</section>
