<script lang="ts">
	import ThemeController from '$lib/components/ThemeController.svelte';
	import { demo, navigation } from '$lib/states/demo.svelte';

	import { layout, setConfiguration, setMobilePanel, layoutView } from '$lib/states/layout.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PlannerPanel from './PlannerPanel.svelte';
	import type { Snippet } from 'svelte';
	let { routeChoices, conditionsSummary }: { routeChoices: Snippet; conditionsSummary: Snippet } =
		$props();
</script>

<aside
	class:hidden={layout.mobile && !!layout.picking}
	class="directions-panel max-[759px]:inset-x-2 max-[759px]:top-auto max-[759px]:bottom-3 max-[759px]:w-auto {layout.mobilePanel ===
	'controls'
		? 'max-[759px]:max-h-[50dvh]'
		: 'max-[759px]:max-h-30'} absolute top-6 left-6 z-[450] flex max-h-[calc(100dvh-115px)] w-[360px] flex-col overflow-auto rounded-box border border-base-300 bg-base-100 shadow-xl"
	class:traveling={demo.started}
>
	<header
		class="brand-header flex items-center justify-between border-b border-base-300 p-4 max-[759px]:hidden"
	>
		<a href="/" class="brand flex items-center gap-2 font-bold"
			><span class="brand-mark text-primary"><Icon name="route" size={23} /></span>FloodNav<span
				class="brand-city badge badge-sm">CEBU</span
			></a
		>
		<div class="flex items-center gap-2">
			<ThemeController />
			<span class="demo-label badge badge-outline"
				>{navigation.gpsTravel ? 'LIVE GPS' : 'TRAVEL DEMO'}</span
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
				><Icon name="bell" size={18} />{#if navigation.notices}<span
						class="badge badge-xs badge-error">{navigation.notices}</span
					>{/if}</button
			>
			<button
				class="icon-button btn btn-circle btn-ghost btn-sm"
				aria-label="Simulation controls"
				aria-expanded={layoutView.drawerOpen}
				disabled={!demo.mounted}
				onclick={() => setConfiguration(!layoutView.drawerOpen)}
				><Icon name="settings" size={18} /></button
			>
		</div>
	</header>
	{#if !demo.started}
		<PlannerPanel {routeChoices} {conditionsSummary} />
	{:else}
		<div class="maneuver-card flex items-start gap-3 p-5">
			<span class="maneuver-arrow text-primary"
				><Icon name={navigation.arrived ? 'pin' : 'arrow'} size={34} /></span
			>
			<div>
				<small class="opacity-60"
					>{navigation.arrived
						? 'JOURNEY COMPLETE'
						: navigation.gpsTravel && (demo.offRoute || demo.busy || demo.gpsMessage)
							? 'GPS STATUS'
							: 'NEXT DIRECTION'}</small
				>
				<h1 class="text-xl font-bold">
					{navigation.arrived
						? 'You have arrived'
						: navigation.gpsTravel && (demo.gpsMessage || demo.busy)
							? demo.gpsMessage || 'Updating directions…'
							: navigation.nextStep?.instruction || 'Continue on your route'}
				</h1>
				<p class="opacity-70">
					{navigation.arrived
						? demo.destination.name
						: `${Math.max(0, Math.round((navigation.nextStep?.progressMeters || 0) - demo.progress))} m ahead`}
				</p>
			</div>
		</div>
	{/if}
	<footer
		class="simulation-footer flex items-center gap-2 border-t border-base-300 p-3 text-xs max-[759px]:hidden"
	>
		<span class="status {demo.connected ? 'status-success' : 'status-warning'} status-sm"></span>
		<span
			>{demo.offlineDemo
				? 'Local offline demo'
				: demo.connected
					? 'Shared conditions connected'
					: 'Connecting…'}</span
		>
	</footer>
</aside>
