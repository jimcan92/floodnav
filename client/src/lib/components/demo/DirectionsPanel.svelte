<script lang="ts">
	import ThemeController from '$lib/components/ThemeController.svelte';
	import { demo, navigation } from '$lib/states/demo.svelte';

	import Icon from '$lib/components/Icon.svelte';
	import {
		layout,
		layoutView,
		setConfiguration,
		setMobilePanel,
		setPlannerOpen
	} from '$lib/states/layout.svelte';
	import type { Snippet } from 'svelte';
	import JourneyInsights from './JourneyInsights.svelte';
	import PlannerPanel from './PlannerPanel.svelte';
	let { routeChoices, conditionsSummary }: { routeChoices: Snippet; conditionsSummary: Snippet } =
		$props();
</script>

{#if !layout.mobile && layout.plannerCollapsed && !layout.picking}
	<div
		class="compact-planner absolute top-6 left-6 z-[450] flex w-[360px] max-w-[calc(100vw-3rem)] items-center gap-1 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
	>
		<button
			class="compact-planner-search btn min-w-0 flex-1 justify-start gap-3 btn-ghost font-normal"
			aria-label={demo.started ? 'Open journey details' : 'Search destination'}
			disabled={!demo.mounted}
			aria-expanded="false"
			aria-controls="directions-panel"
			onclick={() => setPlannerOpen(true, !demo.started)}
		>
			<Icon name={demo.started ? 'arrow' : 'search'} />
			<span class="min-w-0 truncate text-left"
				>{demo.started
					? navigation.nextStep?.instruction || demo.destination.name
					: 'Where to?'}</span
			>
		</button>
		<button
			class="btn btn-square btn-ghost text-primary"
			aria-label="Open directions"
			disabled={!demo.mounted}
			aria-expanded="false"
			aria-controls="directions-panel"
			onclick={() => setPlannerOpen(true)}><Icon name="route" /></button
		>
	</div>
{/if}

<aside
	id="directions-panel"
	class:hidden={(layout.mobile && !!layout.picking) || (!layout.mobile && layout.plannerCollapsed)}
	class="directions-panel max-[759px]:inset-x-2 max-[759px]:top-auto max-[759px]:bottom-3 max-[759px]:w-auto {layout.mobilePanel ===
	'controls'
		? 'max-[759px]:max-h-[calc(var(--mobile-viewport-height,100dvh)*0.5)]'
		: 'max-[759px]:max-h-30'} absolute top-6 left-6 z-[450] flex max-h-[calc(100dvh-115px)] w-[360px] flex-col overflow-x-hidden overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-xl"
	class:traveling={demo.started}
>
	<header
		class="brand-header flex shrink-0 items-center gap-2 border-b border-base-300 px-4 py-2 max-[759px]:hidden"
	>
		<div class="flex flex-1">
			<a href="/" class="brand flex items-center gap-2 font-bold">
				<span class="brand-mark shrink-0 text-primary"><Icon name="route" size={23} /></span>
				FloodNav
			</a>
			<button class="w-full" onclick={() => setPlannerOpen(false)} aria-label="Close"></button>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<!-- <button
				class="planner-close btn btn-circle btn-ghost btn-sm"
				aria-label="Collapse directions"
				aria-expanded="true"
				aria-controls="directions-panel"
				onclick={() => setPlannerOpen(false)}><Icon name="close" size={18} /></button
			> -->
			<button
				class="icon-button notification-toggle btn relative btn-circle btn-ghost btn-sm"
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
						class="absolute -top-1 -right-1 badge badge-xs badge-error">{navigation.notices}</span
					>{/if}</button
			>
			<button
				class="icon-button btn btn-circle btn-ghost btn-sm"
				aria-label="Simulation controls"
				aria-expanded={layoutView.drawerOpen}
				disabled={!demo.mounted}
				onclick={() => setConfiguration(!layoutView.drawerOpen)}
			>
				<Icon name="settings" size={18} />
			</button>
			<ThemeController />
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
		<div class="space-y-3 border-t border-base-300 p-4">
			<JourneyInsights {routeChoices} {conditionsSummary} />
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
