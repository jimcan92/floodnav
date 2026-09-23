<script lang="ts">
	import { onMount } from 'svelte';
	import { isThemeName, resolvedTheme, themeState } from '$lib/states/theme.svelte';
	onMount(() => {
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const update = () => (themeState.systemDark = query.matches);
		update();
		query.addEventListener('change', update);
		try {
			const saved = localStorage.getItem('floodnav-theme');
			if (saved && isThemeName(saved)) themeState.selected = saved;
		} catch {
			/* Theme persistence is optional. */
		}
		return () => query.removeEventListener('change', update);
	});
	$effect(() => {
		document.documentElement.setAttribute('data-theme', resolvedTheme());
	});
</script>
