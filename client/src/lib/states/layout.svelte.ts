import { tick } from 'svelte';

export type MobilePanel = 'controls' | 'notifications' | 'configuration' | null;
export type PickKind = 'origin' | 'destination' | 'traffic' | 'flood';

export const layout = $state({
	mobile: false,
	wide: false,
	mobileViewportHeight: 0,
	mobilePanel: null as MobilePanel,
	desktopDrawerOpen: false,
	plannerCollapsed: true,
	picking: null as PickKind | null,
	panelTrigger: null as HTMLElement | null
});

const drawerOpen = $derived(
	layout.mobile ? layout.mobilePanel === 'configuration' : layout.desktopDrawerOpen
);

export async function setMobilePanel(panel: MobilePanel, restoreFocus = false) {
	if (!layout.mobile && panel === 'controls') return;
	if (panel === 'notifications') layout.desktopDrawerOpen = false;
	if (panel && panel !== layout.mobilePanel)
		layout.panelTrigger = document.activeElement as HTMLElement;
	layout.mobilePanel = panel;
	await tick();
	if (restoreFocus) {
		const target = layout.panelTrigger?.getClientRects().length
			? layout.panelTrigger
			: document.querySelector<HTMLElement>('.mobile-sheet-summary, .notification-toggle');
		target?.focus();
	} else if (panel === 'notifications')
		document.getElementById('mobile-notification-title')?.focus();
	else if (panel === 'configuration')
		document.querySelector<HTMLButtonElement>('.configuration-close button')?.focus();
}

export async function setPlannerOpen(open: boolean, focusDestination = false) {
	layout.plannerCollapsed = !open;
	await tick();
	if (open) {
		const selector = focusDestination
			? '#directions-panel input[aria-label="Destination"]'
			: '#directions-panel .planner-close';
		document.querySelector<HTMLElement>(selector)?.focus();
	} else document.querySelector<HTMLElement>('.compact-planner-search')?.focus();
}

export function setConfiguration(open: boolean) {
	if (layout.mobile) void setMobilePanel(open ? 'configuration' : null, !open);
	else {
		layout.desktopDrawerOpen = open;
		if (open) layout.mobilePanel = null;
	}
}

export function beginPick(kind: PickKind) {
	layout.picking = kind;
	layout.plannerCollapsed = true;
	void setMobilePanel(null);
}

export function cancelPick() {
	layout.picking = null;
}

export function bindLayoutMedia() {
	const query = window.matchMedia('(max-width: 759px)');
	const desktopQuery = window.matchMedia('(min-width: 1100px)');
	const updateDesktop = () => (layout.wide = desktopQuery.matches);
	updateDesktop();
	desktopQuery.addEventListener('change', updateDesktop);
	const viewport = window.visualViewport;
	const resizeViewport = () => {
		layout.mobileViewportHeight = viewport?.height || window.innerHeight;
	};
	resizeViewport();
	viewport?.addEventListener('resize', resizeViewport);
	window.addEventListener('resize', resizeViewport);
	const update = () => {
		layout.mobile = query.matches;
		layout.mobilePanel = null;
	};
	update();
	query.addEventListener('change', update);
	const outside = (event: PointerEvent) => {
		if (
			!layout.mobile &&
			!layout.picking &&
			event.target instanceof Element &&
			event.target.closest('.leaflet-container') &&
			!event.target.closest('.leaflet-control, .leaflet-popup')
		)
			layout.plannerCollapsed = true;
		if (
			layout.mobilePanel === 'notifications' &&
			event.target instanceof Element &&
			!event.target.closest('.demo-alerts, .notification-toggle, .mobile-urgent')
		)
			void setMobilePanel(null);
	};
	document.addEventListener('pointerdown', outside);
	return () => {
		query.removeEventListener('change', update);
		desktopQuery.removeEventListener('change', updateDesktop);
		viewport?.removeEventListener('resize', resizeViewport);
		window.removeEventListener('resize', resizeViewport);
		document.removeEventListener('pointerdown', outside);
	};
}

export const layoutView = {
	get drawerOpen() {
		return drawerOpen;
	}
};
