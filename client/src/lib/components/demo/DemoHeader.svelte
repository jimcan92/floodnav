<script lang="ts">
	import ThemeController from '$lib/components/ThemeController.svelte';
	import { demo, notices, urgentMessage } from '$lib/states/demo.svelte';
	import { cancelPick, drawerOpen, layout, setConfiguration, setMobilePanel } from '$lib/states/layout.svelte';
	import Icon from './Icon.svelte';
</script>

<header
	class="mobile-topbar navbar fixed inset-x-0 top-0 z-[500] flex justify-between bg-base-100/95 px-4 shadow md:hidden"
>
	<a href="/" class="brand flex items-center gap-2 font-bold"><Icon name="route" />FloodNav</a>
	<div class="flex items-center gap-2">
		<ThemeController />
		<button
			class="icon-button btn btn-circle btn-ghost btn-sm"
			aria-label="Simulation controls"
			aria-expanded={drawerOpen}
			disabled={!demo.mounted}
			onclick={() => setConfiguration(!drawerOpen)}><Icon name="settings" /></button
		>
		<button
			class="icon-button notification-toggle btn btn-circle btn-ghost btn-sm"
			disabled={!demo.mounted}
			aria-label={`Notifications, ${notices} active`}
			aria-expanded={layout.mobilePanel === 'notifications'}
			aria-controls="mobile-notifications"
			onclick={() =>
				setMobilePanel(
					layout.mobilePanel === 'notifications' ? null : 'notifications',
					layout.mobilePanel === 'notifications'
				)}
		>
			<Icon name="bell" />
			{#if notices}<span class="notification-count badge badge-error badge-xs">{notices}</span>{/if}
		</button>
	</div>
</header>

{#if urgentMessage && !layout.picking}
	<button
		class="mobile-urgent"
		aria-live="polite"
		onclick={() => setMobilePanel('notifications')}
	>
		<Icon name="rain" size={18} />
		<span>{urgentMessage}</span>
		<Icon name="chevron" size={16} />
	</button>
{/if}

{#if layout.picking}
	<div class="pick-banner">
		<Icon name="pin" />
		<span
			>Click the map to place {layout.picking === 'origin'
				? 'your starting point'
				: layout.picking === 'destination'
					? 'your destination'
					: `a ${layout.picking} area`}</span
		>
		<button class="btn btn-sm" onclick={cancelPick}>Cancel</button>
	</div>
{/if}
