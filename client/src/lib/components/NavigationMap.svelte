<script lang="ts">
	import { createMapMarker } from '$lib/utils/mapMarker';
	import { onMount } from 'svelte';
	import type * as Leaflet from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import type { HazardFeature, WeatherSample } from '$lib/types/rainfall';
	import type {
		Coordinate,
		FloodHazardZone,
		MapLayer,
		RouteOption,
		VehicleCategory
	} from '$lib/types/navigation';
	let {
		origin,
		destination,
		activeRoute,
		alternativeRoute,
		vehiclePosition,
		vehicle,
		floodZones,
		floodSource,
		hazardFeatures = [],
		weatherSamples = [],
		onSelectRoute,
		onMapClick
	}: {
		origin: Coordinate;
		destination: Coordinate;
		activeRoute: RouteOption | null;
		alternativeRoute: RouteOption | null;
		vehiclePosition: Coordinate;
		vehicle: VehicleCategory;
		floodZones: FloodHazardZone[];
		floodSource: 'sensor' | 'simulated' | 'rainfall';
		hazardFeatures?: HazardFeature[];
		weatherSamples?: WeatherSample[];
		onSelectRoute: (id: RouteOption['id']) => void;
		onMapClick?: (point: Coordinate) => void;
	} = $props();
	let container: HTMLDivElement;
	let L: typeof Leaflet;
	let map: Leaflet.Map | undefined;
	let group: Leaflet.LayerGroup;
	let car: Leaflet.Marker;
	let ready = $state(false),
		tileError = $state(false),
		layer = $state<MapLayer>('Hybrid');
	let fitted = '';
	onMount(() => {
		let disposed = false;
		let resize: ResizeObserver;
		let traveler: ReturnType<typeof createMapMarker> | undefined;
		void import('leaflet').then((module) => {
			if (disposed) return;
			L = module;
			map = L.map(container, { center: origin, zoom: 14, maxZoom: 21, zoomControl: false });
			const basemaps = Object.fromEntries(
				Object.entries({ Hybrid: 'y', Satellite: 's', Streets: 'm' }).map(([name, code]) => {
					const tiles = L.tileLayer(`https://mt1.google.com/vt/lyrs=${code}&x={x}&y={y}&z={z}`, {
						maxZoom: 21,
						attribution: '© Google'
					});
					let failed = false;
					tiles.on('loading', () => {
						failed = false;
					});
					tiles.on('tileerror', () => {
						failed = true;
						if (map?.hasLayer(tiles)) tileError = true;
					});
					tiles.on('load', () => {
						if (map?.hasLayer(tiles)) tileError = failed;
					});
					return [name, tiles];
				})
			);
			basemaps.Hybrid.addTo(map);
			L.control.layers(basemaps, undefined, { position: 'topright', collapsed: false }).addTo(map);
			L.control.zoom({ position: 'bottomright' }).addTo(map);
			L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
			map.on('baselayerchange', (e) => {
				layer = e.name as MapLayer;
				tileError = false;
			});
			map.on('click', (e: Leaflet.LeafletMouseEvent) => onMapClick?.([e.latlng.lat, e.latlng.lng]));
			group = L.layerGroup().addTo(map);
			traveler = createMapMarker('car', 'traveler');
			car = L.marker(origin, {
				icon: L.divIcon({
					className: 'traveler-marker',
					html: traveler.element,
					iconSize: [34, 34],
					iconAnchor: [17, 17]
				}),
				interactive: false,
				zIndexOffset: 1000
			}).addTo(map);
			car.bindTooltip('Simulated vehicle');
			resize = new ResizeObserver(() => map?.invalidateSize());
			resize.observe(container);
			ready = true;
		});
		return () => {
			disposed = true;
			resize?.disconnect();
			map?.remove();
			traveler?.destroy();
			map = undefined;
		};
	});
	$effect(() => {
		if (!ready || !map) return;
		group.clearLayers();
		const markers: ReturnType<typeof createMapMarker>[] = [];
		const colors = { LF: '#c4b5fd', MF: '#a78bfa', HF: '#7c3aed', VHF: '#312e81' };
		for (const feature of hazardFeatures) {
			L.geoJSON(feature as GeoJSON.Feature, {
				style: { color: colors[feature.properties.susceptibility], weight: 1, fillOpacity: 0.2 },
				onEachFeature: (_feature, layer) => {
					const text = document.createElement('div');
					text.textContent = `MGB ${feature.properties.susceptibility} susceptibility · polygon ${feature.properties.id}. Not a current flood observation.`;
					layer.bindPopup(text);
				}
			}).addTo(group);
		}
		for (const sample of weatherSamples) {
			L.circleMarker(sample.coordinate, {
				radius: 5,
				color: '#0284c7',
				fillColor: '#7dd3fc',
				fillOpacity: 0.9,
				bubblingMouseEvents: false
			})
				.addTo(group)
				.bindTooltip(
					`OpenWeather sample: ${sample.rainMmH} mm/h · ${new Date(sample.observedAt).toLocaleString()} · grid center, not street-level`
				);
		}
		const marker = (point: Coordinate, label: string, kind: 'origin' | 'destination') => {
			const glyph = createMapMarker(kind === 'origin' ? 'circle' : 'pin', kind);
			markers.push(glyph);
			L.marker(point, {
				icon: L.divIcon({
					className: 'waypoint-marker',
					html: glyph.element,
					iconSize: [28, 28],
					iconAnchor: [14, 14]
				}),
				bubblingMouseEvents: false
			})
				.addTo(group)
				.bindTooltip(label, { permanent: true, direction: 'top' });
		};
		marker(origin, 'A · Origin', 'origin');
		marker(destination, 'B · Destination', 'destination');
		floodZones
			.filter((z) => z.active)
			.forEach((zone) => {
				const blocked = zone.depthCm > (floodSource === 'sensor' ? 0 : vehicle.maxSafeWaterDepthCm);
				const circle = L.circle(zone.center, {
					radius: zone.radiusMeters,
					color: blocked ? '#f87171' : '#fbbf24',
					fillOpacity: 0.3,
					bubblingMouseEvents: false
				}).addTo(group);
				const text = document.createElement('div');
				text.textContent = `${zone.name}: ${zone.depthCm} cm — ${floodSource === 'sensor' ? 'Sensor observation; configured coverage radius' : 'Simulated depth; demo threshold only'}. ${zone.reportedTime}`;
				circle.bindPopup(text);
			});
		if (alternativeRoute && alternativeRoute.id !== activeRoute?.id) {
			const route = L.polyline(alternativeRoute.polyline, {
				color: '#34d399',
				weight: 6,
				dashArray: '8 8',
				bubblingMouseEvents: false
			}).addTo(group);
			route.bindTooltip(
				floodSource === 'rainfall'
					? 'Alternative road route — experimental exposure assessment'
					: 'Alternative avoiding displayed hazard zones'
			);
			route.on('click', () => onSelectRoute('alternative_safe'));
		}
		if (activeRoute) {
			const route = L.polyline(activeRoute.polyline, {
				color: activeRoute.isPassable ? '#38bdf8' : '#f87171',
				weight: 6,
				bubblingMouseEvents: false
			}).addTo(group);
			const geometry = JSON.stringify(activeRoute.polyline);
			if (geometry !== fitted) {
				fitted = geometry;
				map.fitBounds(route.getBounds(), { padding: [35, 35], maxZoom: 16 });
			}
			activeRoute.trafficDots.forEach((dot) =>
				L.circleMarker(dot.coordinate, {
					radius: 3,
					weight: 1,
					color: '#0f172a',
					fillColor:
						dot.level === 'heavy' ? '#ef4444' : dot.level === 'moderate' ? '#facc15' : '#22c55e',
					fillOpacity: 0.85,
					bubblingMouseEvents: false
				})
					.addTo(group)
					.bindTooltip(`Simulated ${dot.level} traffic`)
			);
		}
		return () => markers.forEach((marker) => marker.destroy());
	});
	$effect(() => {
		if (ready) car.setLatLng(vehiclePosition);
	});
</script>

<div class="relative h-full min-h-[360px]" data-map-layer={layer}>
	<div bind:this={container} class="h-full min-h-[360px]"></div>
	<div
		class="map-caption absolute bottom-6 left-2 z-[400] badge h-auto max-w-[80%] bg-base-100 p-2 text-xs"
	>
		{layer} · {floodSource === 'rainfall'
			? 'MGB susceptibility + OpenWeather samples'
			: `Floods: ${floodSource}`} · Traffic: simulated
	</div>
	{#if tileError}<div
			role="status"
			class="map-error absolute inset-x-3 bottom-14 z-[450] alert alert-warning"
		>
			Google map tiles unavailable. Routes and demo controls remain available.<button
				class="btn"
				onclick={() => {
					tileError = false;
					map?.eachLayer((l) => {
						if (l instanceof L.TileLayer) l.redraw();
					});
				}}>Retry map</button
			>
		</div>{/if}
</div>
