<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import PwaStatus from '$lib/components/PwaStatus.svelte';
	import ThemeProvider from '$lib/components/ThemeProvider.svelte';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ThemeProvider />
{@render children()}

<PwaStatus />
