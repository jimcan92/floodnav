<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { observationTime } from '$lib/services/observedFlood';
	import type { RoadRoute } from '$lib/services/routingService';
	import { layout } from '$lib/states/layout.svelte';
	import type { SimulationZone } from '$lib/types/demo';
	import type { Coordinate } from '$lib/types/navigation';
	import type { Bounds, ObservedFloods } from '$lib/types/observedFlood';
	import type { ExposureAssessment } from '$lib/types/rainfall';
	import { createMapMarker } from '$lib/utils/mapMarker';
	import { Locate, Minus, Plus } from '@lucide/svelte';
	import type * as Leaflet from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import { onMount } from 'svelte';
	let {
		origin,
		destination,
		position,
		route = null,
		alternatives = [],
		onselectalternative,
		zones = [],
		picking = false,
		liveTraffic = false,
		followPosition = false,
		offline = false,
		assessment = null,
		observed = null,
		onbounds,
		onpick,
		onzone,
		ontrafficstatus
	}: {
		origin: Coordinate;
		destination: Coordinate;
		position: Coordinate;
		route?: RoadRoute | null;
		alternatives?: RoadRoute[];
		onselectalternative?: (road: RoadRoute) => void;
		zones?: SimulationZone[];
		picking?: boolean;
		liveTraffic?: boolean;
		followPosition?: boolean;
		offline?: boolean;
		assessment?: ExposureAssessment | null;
		observed?: ObservedFloods | null;
		onbounds?: (bounds: Bounds) => void;
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
		showObserved = $state(true),
		showSusceptibility = $state(true),
		showSimulation = $state(true),
		tileError = $state(false);
	let bases: Record<string, Leaflet.TileLayer> = {},
		fitted = '';
	function fit() {
		if (!map) return;
		const path = [
			...(route?.polyline || [origin, destination]),
			...alternatives.flatMap((road) => road.polyline)
		];
		map.fitBounds(L.latLngBounds(path), {
			paddingTopLeft: [24, 24],
			paddingBottomRight: [24, 64],
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
		let traveler: ReturnType<typeof createMapMarker> | undefined;
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
			layer = window.innerWidth < 760 ? 'Streets' : 'Hybrid';
			if (!offline) bases[layer].addTo(map);
			map.on('moveend', () => {
				const b = map.getBounds();
				onbounds?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
			});
			group = L.layerGroup().addTo(map);
			traveler = createMapMarker('navigation', 'traveler');
			car = L.marker(position, {
				interactive: false,
				zIndexOffset: 1000,
				icon: L.divIcon({
					className: 'traveler-marker',
					html: traveler.element,
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
			traveler?.destroy();
		};
	});
	$effect(() => {
		if (!ready) return;
		for (const base of Object.values(bases)) map.removeLayer(base);
		if (!offline) bases[layer].addTo(map);
	});

	$effect(() => {
		if (!ready) return;
		group.clearLayers();
		const markers: ReturnType<typeof createMapMarker>[] = [];
		if (assessment && showSusceptibility)
			for (const feature of assessment.hazards.features)
				L.geoJSON(feature as GeoJSON.Feature, {
					style: { color: '#7c3aed', weight: 1, fillOpacity: 0.12 }
				}).addTo(group);
		for (const z of zones.filter((z) => z.enabled && showSimulation)) {
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
		if (observed && showObserved)
			for (const feature of observed.features) {
				const p = feature.properties;
				const recent =
					!offline &&
					!observed.stale &&
					Date.now() - Date.parse(p.observedAt) <= observed.freshnessHours * 3600000;
				const area = L.geoJSON(feature as GeoJSON.Feature, {
					style: {
						color: recent ? '#16d4c4' : '#93b6b2',
						fillColor: '#16d4c4',
						weight: 2,
						fillOpacity: recent ? 0.35 : 0.16,
						dashArray: p.quality === 'caution' ? '4 4' : undefined
					}
				}).addTo(group);
				const label = document.createElement('div');
				const age = Math.max(0, Math.floor((Date.now() - Date.parse(p.observedAt)) / 3600000));
				label.textContent = `Satellite-observed flooding · ${observationTime(p.observedAt)} · ${age}h old · ${recent ? 'recent observation' : 'dated context'} · ${p.quality === 'high' ? 'likelihood ≥80, no advisory flags' : 'quality caution'} · GFM ${p.version}. No water-depth estimate. ${observed.attribution}`;
				area.bindPopup(label);
			}
		for (const [index, alternative] of alternatives.entries()) {
			L.polyline(alternative.polyline, { color: '#fff', weight: 12, interactive: false }).addTo(
				group
			);
			const line = L.polyline(alternative.polyline, {
				color: '#64748b',
				weight: 7,
				opacity: 1,
				className: 'alternative-route-path'
			}).addTo(group);
			const label = `Alternative ${index + 1} · ${(alternative.distanceMeters / 1000).toFixed(1)} km`;
			line.bindTooltip(`${label} · Select route`, {
				permanent: true,
				direction: 'center',
				className: 'alternative-route-label',
				interactive: true
			});
			line.on('click', () => {
				if (!picking) onselectalternative?.(alternative);
			});
			line.getTooltip()?.on('click', () => {
				if (!picking) onselectalternative?.(alternative);
			});
			const element = line.getElement();
			if (element) {
				element.setAttribute('role', 'button');
				element.setAttribute('tabindex', picking ? '-1' : '0');
				element.setAttribute('aria-label', `Select ${label}`);
				element.addEventListener('keydown', (event) => {
					const key = (event as KeyboardEvent).key;
					if (!picking && (key === 'Enter' || key === ' ')) {
						event.preventDefault();
						onselectalternative?.(alternative);
					}
				});
			}
		}
		if (route) {
			L.polyline(route.polyline, { color: '#fff', weight: 10, interactive: false }).addTo(group);
			L.polyline(route.polyline, { color: '#2875e7', weight: 6, interactive: false }).addTo(group);
		}
		for (const [point, kind] of [
			[origin, 'origin'],
			[destination, 'destination']
		] as const) {
			const marker = createMapMarker(kind === 'origin' ? 'circle' : 'pin', kind);
			markers.push(marker);
			L.marker(point, {
				icon: L.divIcon({
					className: 'waypoint-marker',
					html: marker.element,
					iconSize: [28, 28],
					iconAnchor: [14, 14]
				}),
				interactive: false
			}).addTo(group);
		}
		const key = route
			? route.key + JSON.stringify([route.polyline[0], route.polyline.at(-1)])
			: JSON.stringify([origin, destination]);
		const previewKey = key + JSON.stringify(alternatives.map((road) => [road.key, road.polyline]));
		if (previewKey !== fitted) {
			fitted = previewKey;
			fit();
		}
		return () => markers.forEach((marker) => marker.destroy());
	});
	$effect(() => {
		if (ready) {
			car.setLatLng(position);
			if (followPosition && !picking) map.panTo(position, { animate: false });
		}
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

<div
	class="demo-map absolute inset-0 h-full w-full bg-base-200"
	class:picking
	class:offline
	data-map-layer={layer}
	bind:this={container}
></div>

<div class="map-tools absolute top-4 right-4 z-[400] flex flex-col gap-2 max-[759px]:top-32">
	<button
		class="map-tool btn-base-100 btn btn-circle shadow btn-sm"
		aria-label="Recenter map"
		title="Recenter map"
		onclick={() => (followPosition ? map?.panTo(position) : fit())}
	>
		<Locate class="h-4 w-4" />
	</button>
	<div class="zoom-group join join-vertical">
		<button
			class="map-tool btn join-item btn-sm"
			aria-label="Zoom in"
			onclick={() => map?.zoomIn()}
		>
			<Plus class="h-3 w-3" />
		</button>
		<button
			class="map-tool btn join-item btn-sm"
			aria-label="Zoom out"
			onclick={() => map?.zoomOut()}
		>
			<Minus class="h-3 w-3" />
		</button>
	</div>
</div>
{#if !offline}
	<div
		class="layer-control absolute bottom-6 left-6 z-460 max-[759px]:left-3"
		style:bottom={layout.mobile
			? layout.mobilePanel === 'controls'
				? 'calc(var(--mobile-viewport-height, 100dvh) * 0.5 + 1.5rem)'
				: '8.5rem'
			: undefined}
	>
		<button
			class="layer-button btn h-14 gap-2 rounded-box border-base-300 bg-base-100 px-4 text-base-content shadow-lg"
			onclick={() => (layerOpen = !layerOpen)}
			aria-label="Map layers"
			aria-expanded={layerOpen}
			aria-controls="map-layer-options"
		>
			<Icon name="layers" size={22} /><span class="text-left">
				Layers
				<small class="block text-[10px] font-normal opacity-60">{layer}</small></span
			>
		</button>
		{#if layerOpen}
			<div
				id="map-layer-options"
				class="layer-options absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 p-3 text-base-content shadow-xl"
			>
				<div class="mb-3 flex items-center justify-between">
					<strong class="text-sm">Map layers</strong><button
						class="btn btn-circle btn-ghost btn-xs"
						aria-label="Close map layers"
						onclick={() => (layerOpen = false)}><Icon name="close" size={16} /></button
					>
				</div>
				<div class="grid grid-cols-3 gap-1" role="group" aria-label="Base map">
					{#each ['Streets', 'Satellite', 'Hybrid'] as name}<button
							class="btn px-1 btn-sm"
							class:btn-primary={name === layer}
							class:btn-ghost={name !== layer}
							aria-pressed={name === layer}
							onclick={() => changeLayer(name)}>{name}</button
						>{/each}
				</div>
				<div class="mt-3 space-y-3 border-t border-base-300 pt-3 text-xs">
					<label class="flex cursor-pointer items-center justify-between gap-3"
						><span>Satellite observations</span><input
							class="toggle toggle-primary toggle-sm"
							type="checkbox"
							bind:checked={showObserved}
						/></label
					>
					<label class="flex cursor-pointer items-center justify-between gap-3"
						><span>Flood susceptibility</span><input
							class="toggle toggle-primary toggle-sm"
							type="checkbox"
							bind:checked={showSusceptibility}
						/></label
					>
					<label class="flex cursor-pointer items-center justify-between gap-3"
						><span>Simulation areas</span><input
							class="toggle toggle-primary toggle-sm"
							type="checkbox"
							bind:checked={showSimulation}
						/></label
					>
				</div>
			</div>
		{/if}
	</div>
{/if}
<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') layerOpen = false;
	}}
	onpointerdown={(event) => {
		if (event.target instanceof Element && !event.target.closest('.layer-control'))
			layerOpen = false;
	}}
/>

{#if tileError && !offline}<div class="tile-notice">
		Map tiles unavailable. Travel controls still work.<button
			class="btn"
			onclick={() => {
				tileError = false;
				bases[layer]?.redraw();
			}}>Retry</button
		>
	</div>{/if}
