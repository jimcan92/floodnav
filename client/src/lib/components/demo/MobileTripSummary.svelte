<script lang="ts">
	import { formatTravelTime, VEHICLE_TRAVEL_PROFILES } from '$lib/services/demoSimulation';
	import { demo, navigation } from '$lib/states/demo.svelte';
	import { layout, setMobilePanel } from '$lib/states/layout.svelte';
	import { kmLabel } from '$lib/utils/messages';

	import Icon from '$lib/components/Icon.svelte';
</script>

<button
	class="mobile-sheet-summary btn h-auto min-h-0 w-full justify-between rounded-none btn-ghost py-3 min-[760px]:hidden"
	disabled={!demo.mounted}
	aria-expanded={layout.mobilePanel === 'controls'}
	aria-controls="mobile-planner"
	aria-label={layout.mobilePanel === 'controls' ? 'Collapse trip controls' : 'Expand trip controls'}
	onclick={() => setMobilePanel(layout.mobilePanel === 'controls' ? null : 'controls')}
>
	<span class="text-left"
		><strong>{demo.destination.name || 'Choose destination'}</strong><small class="block opacity-70"
			>{VEHICLE_TRAVEL_PROFILES[navigation.vehicle.id].label} · {navigation.gpsTravel
				? 'GPS'
				: 'Demo'} · {demo.busy
				? 'Finding route…'
				: navigation.blocked
					? 'Blocked'
					: navigation.ownRoad
						? `${formatTravelTime(navigation.remainingSeconds)} · ${kmLabel(navigation.ownRoad.distanceMeters)}`
						: 'Choose destination'}</small
		></span
	><Icon name="chevron" />
</button>
