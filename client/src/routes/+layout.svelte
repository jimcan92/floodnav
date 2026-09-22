<script lang="ts">
	import './layout.css';
	import PwaStatus from '$lib/components/PwaStatus.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

<PwaStatus />
