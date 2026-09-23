<script lang="ts">
	import { icons, type IconName } from '$lib/utils/icons';
	let {
		name = 'pin',
		size = 20,
		class: className = 'shrink-0'
	}: { name?: IconName; size?: number; class?: string } = $props();
	const Glyph = $derived(icons[name]);
</script>

<Glyph {size} class={className} aria-hidden="true" />
