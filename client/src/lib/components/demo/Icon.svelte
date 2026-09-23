<script lang="ts">
	import {
		ArrowUp,
		Bike,
		Car,
		ChevronDown,
		CloudRain,
		Crosshair,
		Layers,
		MapPin,
		Pause,
		Play,
		Plus,
		Route,
		Search,
		Settings,
		Bell,
		TrafficCone,
		Trash2,
		Truck,
		Volume2,
		X,
		ArrowLeftRight
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	const icons: Record<string, Component<{ size?: number | string; class?: string }>> = {
		suv: Car,
		truck: Truck,
		motorcycle: Bike,
		bicycle: Bike,
		pin: MapPin,
		route: Route,
		arrow: ArrowUp,
		car: Car,
		rain: CloudRain,
		traffic: TrafficCone,
		bell: Bell,
		settings: Settings,
		target: Crosshair,
		layers: Layers,
		search: Search,
		close: X,
		play: Play,
		pause: Pause,
		sound: Volume2,
		plus: Plus,
		chevron: ChevronDown,
		trash: Trash2,
		swap: ArrowLeftRight
	};

	let {
		name = 'pin',
		size = 20,
		class: className = 'shrink-0'
	}: { name?: string; size?: number; class?: string } = $props();
	const Glyph = $derived(icons[name] || MapPin);
</script>

<Glyph {size} class={className} />
