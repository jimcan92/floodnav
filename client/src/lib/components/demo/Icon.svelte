<script lang="ts">
	let { name = 'pin', size = 20 }: { name?: string; size?: number } = $props();
	const paths: Record<string, string> = {
		suv: 'M3 17V8l3-4h11l4 5v8H3 M4 10h16 M9 5v5m6-5v5 M6 17v3m12-3v3 M6 14h2m8 0h2',
		truck:
			'M2 5h12v12H2V5Z M14 9h5l3 4v4h-8 M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
		motorcycle:
			'M8 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M22 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 17l4-7h6l-4 7H5 M15 6h3l1 11 M8 9H5 M15 10l4 7',
		bicycle:
			'M8 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M22 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 17l4-8 5 8H5l10-8 M7 6h4 M9 6v3 M14 5h3l2 12',

		pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
		route: 'M5 20V5m0 0L1 9m4-4 4 4 M19 4v15m0 0-4-4m4 4 4-4',
		arrow: 'M12 21V3m0 0-7 7m7-7 7 7',
		car: 'M5 17H3V9l2-5h14l2 5v8h-2 M5 17h14 M5 9h14 M6 13h2m8 0h2 M5 17v3m14-3v3',
		rain: 'M7 14H6a4 4 0 1 1 1-8 6 6 0 0 1 11 1 4 4 0 0 1 0 8 M8 18l-1 3m6-3-1 3m6-3-1 3',
		traffic: 'M8 2h8v20H8z M11 6h2m-2 6h2m-2 6h2 M4 6l4 3m12-3-4 3M4 14l4 3m12-3-4 3',
		settings: 'M4 7h16M4 17h16 M8 4v6m8 4v6',
		target: 'M12 2v4m0 12v4M2 12h4m12 0h4 M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M12 10v4m-2-2h4',
		layers: 'm12 3 10 6-10 6L2 9l10-6Zm-10 11 10 6 10-6M2 18l10 6 10-6',
		search: 'M16 16l6 6 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
		close: 'm6 6 12 12M6 18 18 6',
		play: 'm8 4 12 8-12 8V4Z',
		pause: 'M8 4v16M16 4v16',
		sound: 'm11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
		link: 'm9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
		plus: 'M12 5v14M5 12h14',
		chevron: 'm7 10 5 5 5-5',
		back: 'm14 5-7 7 7 7M7 12h14',
		trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name] || paths.pin} /></svg
>
