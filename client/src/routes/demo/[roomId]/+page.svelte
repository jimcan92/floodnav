<script lang="ts">
	import { page } from '$app/state';
	import DemoApp from '$lib/components/demo/DemoApp.svelte';
</script>

{#key page.params.roomId}<DemoApp roomId={page.params.roomId} />{/key}
