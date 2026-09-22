<script lang="ts">
	import { onMount } from 'svelte';
	import type * as Leaflet from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import Icon from './Icon.svelte';
	import type { Coordinate } from '$lib/types/navigation';
	import type { SimulationZone } from '$lib/types/demo';
	import type { RoadRoute } from '$lib/services/routingService';
	import type { ExposureAssessment } from '$lib/types/rainfall';
	let {
		origin,
		destination,
		position,
		route = null,
		alternative = null,
		zones = [],
		picking = false,
		liveTraffic = false,
		assessment = null,
		onpick,
		onzone,
		ontrafficstatus
	}: {
		origin: Coordinate;
		destination: Coordinate;
		position: Coordinate;
		route?: RoadRoute | null;
		alternative?: RoadRoute | null;
		zones?: SimulationZone[];
		picking?: boolean;
		liveTraffic?: boolean;
		assessment?: ExposureAssessment | null;
		onpick: (p: Coordinate) => void;
		onzone?: (id: string) => void;
		ontrafficstatus?: (message: string) => void;
	} = $props();
	let container: HTMLDivElement,
		L: typeof Leaflet,
		map: Leaflet.Map,
		group: Leaflet.LayerGroup,
		car: Leaflet.Marker,
		traffic: Leaflet.TileLayer | null = null;
	let ready = $state(false),
		layer = $state('Streets'),
		layerOpen = $state(false),
		tileError = $state(false);
	let bases: Record<string, Leaflet.TileLayer> = {},
		fitted = '';
	function fit() {
		if (!map) return;
		const path = route?.polyline || [origin, destination];
		const narrow = window.innerWidth < 760;
		map.fitBounds(L.latLngBounds(path), {
			paddingTopLeft: narrow ? [30, 260] : [410, 90],
			paddingBottomRight: narrow ? [30, 160] : [70, 100],
			maxZoom: 16
		});
	}
	function changeLayer(name: string) {
		Object.values(bases).forEach((b) => map.removeLayer(b));
		bases[name].addTo(map);
		layer = name;
		layerOpen = false;
		tileError = false;
	}
	onMount(() => {
		let disposed = false;
		let resize: ResizeObserver;
		void import('leaflet').then((module) => {
			if (disposed) return;
			L = module;
			map = L.map(container, {
				center: origin,
				zoom: 13,
				zoomControl: false,
				zoomAnimation: false,
				fadeAnimation: false,
				markerZoomAnimation: false
			});
			for (const [name, code] of Object.entries({ Streets: 'm', Satellite: 's', Hybrid: 'y' })) {
				bases[name] = L.tileLayer(`https://mt1.google.com/vt/lyrs=${code}&x={x}&y={y}&z={z}`, {
					maxZoom: 20,
					attribution: '© Google'
				});
				bases[name].on('tileerror', () => {
					if (map.hasLayer(bases[name])) tileError = true;
				});
			}
			bases.Streets.addTo(map);
			group = L.layerGroup().addTo(map);
			car = L.marker(position, {
				interactive: false,
				zIndexOffset: 1000,
				icon: L.divIcon({
					className: 'traveler-marker',
					html: '<span>➤</span>',
					iconSize: [34, 34],
					iconAnchor: [17, 17]
				})
			}).addTo(map);
			map.on('click', (e: Leaflet.LeafletMouseEvent) => {
				if (picking) onpick([e.latlng.lat, e.latlng.lng]);
			});
			resize = new ResizeObserver(() => map.invalidateSize());
			resize.observe(container);
			ready = true;
		});
		return () => {
			disposed = true;
			resize?.disconnect();
			map?.remove();
		};
	});
	$effect(() => {
		if (!ready) return;
		group.clearLayers();
		if (assessment)
			for (const feature of assessment.hazards.features)
				L.geoJSON(feature as GeoJSON.Feature, {
					style: { color: '#7c3aed', weight: 1, fillOpacity: 0.12 }
				}).addTo(group);
		for (const z of zones.filter((z) => z.enabled)) {
			const color =
				z.kind === 'flood'
					? '#0891b2'
					: z.level === 'heavy'
						? '#e94235'
						: z.level === 'moderate'
							? '#f9ab00'
							: '#34a853';
			const area = L.circle(z.center, {
				radius: z.radiusMeters,
				color,
				weight: 2,
				fillOpacity: 0.17,
				bubblingMouseEvents: false
			}).addTo(group);
			const label = document.createElement('div');
			label.textContent =
				z.kind === 'flood'
					? `${z.name} · ${z.depthCm} cm · ${z.rainMmH} mm/h (simulated)`
					: `${z.name} · ${z.level} traffic (simulated)`;
			area.bindTooltip(label);
			area.on('click', () => {
				if (picking) onpick(z.center);
				else onzone?.(z.id);
			});
		}
		if (alternative)
			L.polyline(alternative.polyline, {
				color: '#8aa8de',
				weight: 5,
				opacity: 0.8,
				interactive: false
			}).addTo(group);
		if (route) {
			L.polyline(route.polyline, { color: '#fff', weight: 10, interactive: false }).addTo(group);
			L.polyline(route.polyline, { color: '#2875e7', weight: 6, interactive: false }).addTo(group);
		}
		for (const [point, text, color] of [
			[origin, 'A', '#4285f4'],
			[destination, 'B', '#ea4335']
		] as [Coordinate, string, string][]) {
			L.marker(point, {
				icon: L.divIcon({
					className: 'waypoint-marker',
					html: `<span style="background:${color}">${text}</span>`,
					iconSize: [28, 28],
					iconAnchor: [14, 14]
				}),
				interactive: false
			}).addTo(group);
		}
		const key = route
			? route.key + JSON.stringify([route.polyline[0], route.polyline.at(-1)])
			: JSON.stringify([origin, destination]);
		if (key !== fitted) {
			fitted = key;
			fit();
		}
	});
	$effect(() => {
		if (ready) car.setLatLng(position);
	});
	$effect(() => {
		if (!ready) return;
		if (!liveTraffic) {
			ontrafficstatus?.('');
			return;
		}
		traffic = L.tileLayer(`/api/demo/traffic/{z}/{x}/{y}?v=${Math.floor(Date.now() / 60000)}`, {
			maxZoom: 20,
			attribution: 'Traffic © TomTom',
			opacity: 0.8
		}).addTo(map);
		let failed = false,
			lastSuccess = 0;
		traffic.on('loading', () => {
			failed = false;
		});
		traffic.on('tileerror', () => {
			failed = true;
			ontrafficstatus?.('Live traffic overlay unavailable');
		});
		traffic.on('load', () => {
			if (!failed) {
				lastSuccess = Date.now();
				ontrafficstatus?.(
					`Traffic fetched ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
				);
			}
		});
		const timer = setInterval(() => {
			if (lastSuccess && Date.now() - lastSuccess > 300000)
				ontrafficstatus?.('Traffic overlay stale');
			if (!document.hidden)
				traffic?.setUrl(`/api/demo/traffic/{z}/{x}/{y}?v=${Math.floor(Date.now() / 60000)}`);
		}, 60000);
		return () => {
			clearInterval(timer);
			traffic?.remove();
			traffic = null;
		};
	});
</script>

<div class="demo-map" class:picking data-map-layer={layer} bind:this={container}></div>
<div class="map-tools">
	<button class="map-tool" aria-label="Recenter map" title="Recenter map" onclick={fit}
		><Icon name="target" /></button
	>
	<div class="zoom-group">
		<button class="map-tool" aria-label="Zoom in" onclick={() => map?.zoomIn()}>+</button><button
			class="map-tool"
			aria-label="Zoom out"
			onclick={() => map?.zoomOut()}>−</button
		>
	</div>
</div>
<div class="layer-control">
	<button class="layer-button" onclick={() => (layerOpen = !layerOpen)} aria-expanded={layerOpen}
		><Icon name="layers" size={18} />{layer}</button
	>{#if layerOpen}<div class="layer-options">
			{#each ['Streets', 'Satellite', 'Hybrid'] as name}<button
					class:active={name === layer}
					onclick={() => changeLayer(name)}>{name}</button
				>{/each}
		</div>{/if}
</div>
{#if tileError}<div class="tile-notice">
		Map tiles unavailable. Demo controls still work.<button
			onclick={() => {
				tileError = false;
				bases[layer]?.redraw();
			}}>Retry</button
		>
	</div>{/if}
