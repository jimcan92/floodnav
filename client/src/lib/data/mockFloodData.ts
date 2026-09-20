import type { FloodHazardZone, Coordinate } from '../types/navigation';

export interface LocationPreset {
	id: string;
	name: string;
	shortDescription: string;
	coordinate: Coordinate;
}

export const PRESET_ORIGINS: LocationPreset[] = [
	{
		id: 'cebu_fuente',
		name: 'Fuente Osmeña Circle, Cebu City',
		shortDescription: 'Uptown Commercial Center',
		coordinate: [10.3117, 123.8938]
	},
	{
		id: 'cebu_it_park',
		name: 'Cebu IT Park, Lahug',
		shortDescription: 'Business Process District',
		coordinate: [10.3297, 123.9062]
	},
	{
		id: 'cebu_capitol',
		name: 'Cebu Provincial Capitol',
		shortDescription: 'Escario / Capitol Site',
		coordinate: [10.3173, 123.8907]
	}
];

export const PRESET_DESTINATIONS: LocationPreset[] = [
	{
		id: 'cebu_colon',
		name: 'Colon Street (Heritage Downtown)',
		shortDescription: 'Historic downtown, prone to tidal / flash floods',
		coordinate: [10.2974, 123.8996]
	},
	{
		id: 'sm_city_cebu',
		name: 'SM City Cebu, North Reclamation Area',
		shortDescription: 'Reclamation corridor near sub-sea level outlets',
		coordinate: [10.3121, 123.9184]
	},
	{
		id: 'mandaue_as_fortuna',
		name: 'A.S. Fortuna St., Mandaue City',
		shortDescription: 'Commercial arterial known for heavy rain flooding',
		coordinate: [10.3392, 123.9275]
	},
	{
		id: 'cebu_ayala',
		name: 'Ayala Center Cebu, Cebu Business Park',
		shortDescription: 'Central Business Park',
		coordinate: [10.3177, 123.9054]
	}
];

// Initial mock flood zones
export const INITIAL_FLOOD_ZONES: FloodHazardZone[] = [
	{
		id: 'flood_colon_st',
		name: 'Colon St. & P. Lopez Junction Flood',
		center: [10.2988, 123.8985],
		radiusMeters: 140,
		depthCm: 32, // 32 cm: Impassable for sedans/motorcycles (max 15cm) and medium crossovers (max 25cm), passable only for high-clearance pickups/trucks!
		severity: 'knee',
		affectedRoad: 'Colon Street / P. Lopez',
		reportedTime: '5 mins ago',
		description:
			'Knee-deep water accumulating due to clogged canal drainage. Unsafe for sedans and small vehicles.',
		active: true
	},
	{
		id: 'flood_mj_cuenco',
		name: 'M.J. Cuenco Ave. Submerged Section',
		center: [10.3065, 123.9095],
		radiusMeters: 170,
		depthCm: 45, // 45 cm: Deep flood! Impassable for low and medium clearance.
		severity: 'waist',
		affectedRoad: 'M.J. Cuenco Avenue',
		reportedTime: '12 mins ago',
		description:
			'High flood water. Passable ONLY with high clearance 4x4 or heavy trucks with elevated intake.',
		active: true
	},
	{
		id: 'flood_north_rec',
		name: 'North Reclamation Access Way',
		center: [10.3168, 123.9212],
		radiusMeters: 100,
		depthCm: 14, // 14 cm: Ankle deep. Passable with caution for sedans & motorcycles.
		severity: 'ankle',
		affectedRoad: 'Juan Luna Ave Ext',
		reportedTime: '2 mins ago',
		description:
			'Shallow gutter flood, slowing down traffic. Reduce speed to prevent hydroplaning.',
		active: true
	}
];
