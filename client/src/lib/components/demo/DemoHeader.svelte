<script lang="ts">
	import ThemeController from '$lib/components/ThemeController.svelte';
	import { demo, navigation } from '$lib/states/demo.svelte';
	import {
		cancelPick,
		layout,
		setConfiguration,
		setMobilePanel,
		layoutView
	} from '$lib/states/layout.svelte';
	import Icon from '$lib/components/Icon.svelte';
</script>

<header
	class="mobile-topbar navbar fixed inset-x-0 top-0 z-[500] flex justify-between bg-base-100/95 px-4 shadow min-[760px]:hidden"
>
	<a href="/" class="brand flex items-center gap-2 font-bold"><Icon name="route" />FloodNav</a>
	<div class="flex items-center gap-2">
		<ThemeController />
		<button
			class="icon-button btn btn-circle btn-ghost btn-sm"
			aria-label="Simulation controls"
			aria-expanded={layoutView.drawerOpen}
			disabled={!demo.mounted}
			onclick={() => setConfiguration(!layoutView.drawerOpen)}><Icon name="settings" /></button
		>
		<button
			class="icon-button notification-toggle btn btn-circle btn-ghost btn-sm"
			disabled={!demo.mounted}
			aria-label={`Notifications, ${navigation.notices} active`}
			aria-expanded={layout.mobilePanel === 'notifications'}
			aria-controls="mobile-notifications"
			onclick={() =>
				setMobilePanel(
					layout.mobilePanel === 'notifications' ? null : 'notifications',
					layout.mobilePanel === 'notifications'
				)}
		>
			<Icon name="bell" />
			{#if navigation.notices}<span class="notification-count badge badge-xs badge-error"
					>{navigation.notices}</span
				>{/if}
		</button>
	</div>
</header>

{#if navigation.urgentMessage && !layout.picking}
	<button
		class="mobile-urgent absolute inset-x-2 top-16 z-[550] alert flex alert-warning min-[760px]:hidden"
		aria-live="polite"
		onclick={() => setMobilePanel('notifications')}
	>
		<Icon name="rain" size={18} />
		<span>{navigation.urgentMessage}</span>
		<Icon name="chevron" size={16} />
	</button>
{/if}

{#if layout.picking}
	<div class="pick-banner absolute inset-x-2 top-16 z-[800] alert flex alert-info">
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
