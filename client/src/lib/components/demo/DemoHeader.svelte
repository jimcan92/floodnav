<script lang="ts">
	import ThemeController from '$lib/components/ThemeController.svelte';
	import Icon from './Icon.svelte';

	let {
		mounted,
		drawerOpen,
		mobilePanel,
		notificationCount,
		urgentMessage,
		picking,
		onToggleConfiguration,
		onToggleNotifications,
		onSetPanel,
		onCancelPick
	}: {
		mounted: boolean;
		drawerOpen: boolean;
		mobilePanel: 'controls' | 'notifications' | 'configuration' | null;
		notificationCount: number;
		urgentMessage: string;
		picking: 'origin' | 'destination' | 'traffic' | 'flood' | null;
		onToggleConfiguration: () => void;
		onToggleNotifications: () => void;
		onSetPanel: (panel: 'notifications' | null) => void;
		onCancelPick: () => void;
	} = $props();
</script>

<header
	class="mobile-topbar navbar fixed inset-x-0 top-0 z-[500] flex justify-between bg-base-100/95 px-4 shadow md:hidden"
>
	<a href="/" class="brand"><Icon name="route" />FloodNav</a>
	<div>
		<ThemeController />
		<button
			class="icon-button"
			aria-label="Simulation controls"
			aria-expanded={drawerOpen}
			disabled={!mounted}
			onclick={onToggleConfiguration}><Icon name="settings" /></button
		>
		<button
			class="icon-button notification-toggle"
			disabled={!mounted}
			aria-label={`Notifications, ${notificationCount} active`}
			aria-expanded={mobilePanel === 'notifications'}
			aria-controls="mobile-notifications"
			onclick={onToggleNotifications}
		>
			<Icon name="bell" />
			{#if notificationCount}<span class="notification-count">{notificationCount}</span>{/if}
		</button>
	</div>
</header>

{#if urgentMessage && !picking}
	<button class="mobile-urgent" aria-live="polite" onclick={() => onSetPanel('notifications')}>
		<Icon name="rain" size={18} />
		<span>{urgentMessage}</span>
		<Icon name="chevron" size={16} />
	</button>
{/if}

{#if picking}
	<div class="pick-banner">
		<Icon name="pin" />
		<span
			>Click the map to place {picking === 'origin'
				? 'your starting point'
				: picking === 'destination'
					? 'your destination'
					: `a ${picking} area`}</span
		>
		<button onclick={onCancelPick}>Cancel</button>
	</div>
{/if}
