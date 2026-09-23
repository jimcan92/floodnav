import { mount, unmount } from 'svelte';
import Icon from '$lib/components/Icon.svelte';
import type { IconName } from './icons';

/** Leaflet owns positioning; this component owns only the marker glyph. */
export function createMapMarker(name: IconName, kind: 'origin' | 'destination' | 'traveler') {
	const element = document.createElement('div');
	element.className =
		'grid h-full w-full place-items-center rounded-full shadow-lg ' +
		(kind === 'destination' ? 'bg-error text-error-content' : 'bg-primary text-primary-content');
	const component = mount(Icon, {
		target: element,
		props: { name, size: kind === 'traveler' ? 22 : 18 }
	});
	return {
		element,
		destroy: () => {
			void unmount(component);
		}
	};
}
