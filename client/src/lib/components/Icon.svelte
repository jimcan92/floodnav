<script lang="ts">
	import { icons, type IconName } from '$lib/utils/icons';
	let {
		name = 'pin',
		size = 20,
		class: className = 'shrink-0'
	}: { name?: IconName; size?: number; class?: string } = $props();
	const vehiclePaths: Partial<Record<IconName, string>> = {
		car: 'M5 17H3V9l2-5h14l2 5v8h-2 M5 17h14 M5 9h14 M6 13h2m8 0h2 M5 17v3m14-3v3',
		suv: 'M3 17V8l3-4h11l4 5v8H3 M4 10h16 M9 5v5m6-5v5 M6 17v3m12-3v3 M6 14h2m8 0h2',
		truck:
			'M2 5h12v12H2V5Z M14 9h5l3 4v4h-8 M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
		motorcycle:
			'M8 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M22 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 17l4-7h6l-4 7H5 M15 6h3l1 11 M8 9H5 M15 10l4 7',
		bicycle:
			'M8 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M22 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 17l4-8 5 8H5l10-8 M7 6h4 M9 6v3 M14 5h3l2 12'
	};
	const Glyph = $derived(icons[name]);
</script>

{#if vehiclePaths[name]}
	<svg
		width={size}
		height={size}
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d={vehiclePaths[name]} /></svg
	>
{:else}
	<Glyph {size} class={className} aria-hidden="true" />
{/if}
