import type { IconName } from '$lib/utils/icons';
import type { FloodHazardZone, Coordinate } from '../types/navigation';

export interface LocationPreset {
	id: string;
	name: string;
	shortDescription: string;
	coordinate: Coordinate;
	category?: 'popular' | 'commercial' | 'transit' | 'health' | 'flood_prone';
	icon?: IconName;
}

export const PRESET_ORIGINS: LocationPreset[] = [
	{
		id: 'cebu_fuente',
		name: 'Fuente Osmeña Circle, Cebu City',
		shortDescription: 'Uptown Commercial Center',
		coordinate: [10.3117, 123.8938],
		category: 'popular',
		icon: 'circle'
	},
	{
		id: 'cebu_it_park',
		name: 'Cebu IT Park, Lahug',
		shortDescription: 'Salinas Drive · Business Process District',
		coordinate: [10.3297, 123.9062],
		category: 'commercial',
		icon: 'work'
	},
	{
		id: 'cebu_capitol',
		name: 'Cebu Provincial Capitol',
		shortDescription: 'Escario St / Capitol Site',
		coordinate: [10.3173, 123.8907],
		category: 'popular',
		icon: 'landmark'
	},
	{
		id: 'cebu_ayala_origin',
		name: 'Ayala Center Cebu',
		shortDescription: 'Cardinal Rosales Ave, Cebu Business Park',
		coordinate: [10.3177, 123.9054],
		category: 'commercial',
		icon: 'shopping'
	},
	{
		id: 'cebu_emall_origin',
		name: 'E-Mall (Elizabeth Mall)',
		shortDescription: 'Leon Kilat Street, Sambag I, Cebu City',
		coordinate: [10.2995, 123.8967],
		category: 'transit',
		icon: 'clock'
	},
	{
		id: 'mandaue_city_hall_origin',
		name: 'Mandaue City Hall',
		shortDescription: 'Centro, Mandaue City',
		coordinate: [10.3341, 123.9431],
		category: 'popular',
		icon: 'landmark'
	},
	{
		id: 'cebu_chong_hua_origin',
		name: 'Chong Hua Hospital',
		shortDescription: 'J. Llorente St, Fuente Area',
		coordinate: [10.3135, 123.8924],
		category: 'health',
		icon: 'hospital'
	}
];

export const PRESET_DESTINATIONS: LocationPreset[] = [
	{
		id: 'cebu_colon',
		name: 'Colon Street (Heritage Downtown)',
		shortDescription: 'Historic downtown, prone to tidal / flash floods',
		coordinate: [10.2974, 123.8996],
		category: 'flood_prone',
		icon: 'waves'
	},
	{
		id: 'sm_city_cebu',
		name: 'SM City Cebu, North Reclamation Area',
		shortDescription: 'Reclamation corridor near sub-sea level outlets',
		coordinate: [10.3121, 123.9184],
		category: 'commercial',
		icon: 'shopping'
	},
	{
		id: 'mandaue_as_fortuna',
		name: 'A.S. Fortuna St., Mandaue City',
		shortDescription: 'Commercial arterial known for heavy rain flooding',
		coordinate: [10.3392, 123.9275],
		category: 'flood_prone',
		icon: 'waves'
	},
	{
		id: 'cebu_ayala',
		name: 'Ayala Center Cebu, Cebu Business Park',
		shortDescription: 'Central Business Park',
		coordinate: [10.3177, 123.9054],
		category: 'commercial',
		icon: 'shopping'
	},
	{
		id: 'sm_seaside_cebu',
		name: 'SM Seaside City Cebu',
		shortDescription: 'South Road Properties (SRP), Mambaling',
		coordinate: [10.2818, 123.8812],
		category: 'commercial',
		icon: 'shopping'
	},
	{
		id: 'cebu_robinsons_galleria',
		name: 'Robinsons Galleria Cebu',
		shortDescription: 'General Maxilom Ave Extension, Tejero',
		coordinate: [10.3065, 123.9103],
		category: 'commercial',
		icon: 'shopping'
	},
	{
		id: 'cebu_emall',
		name: 'E-Mall (Elizabeth Mall)',
		shortDescription: 'Leon Kilat Street, Sambag I, Cebu City',
		coordinate: [10.2995, 123.8967],
		category: 'transit',
		icon: 'clock'
	},
	{
		id: 'cebu_doc_hospital',
		name: "Cebu Doctors' University Hospital",
		shortDescription: 'Osmeña Blvd, Capitol Site',
		coordinate: [10.3142, 123.8913],
		category: 'health',
		icon: 'hospital'
	},
	{
		id: 'usc_talamban',
		name: 'USC - Talamban Campus',
		shortDescription: 'Gov. M. Cuenco Ave, Nasipit, Talamban',
		coordinate: [10.3541, 123.9135],
		category: 'popular',
		icon: 'school'
	},
	{
		id: 'carbon_market',
		name: 'Carbon Market Complex',
		shortDescription: 'M.C. Briones St, Downtown Waterfront',
		coordinate: [10.2917, 123.8988],
		category: 'popular',
		icon: 'store'
	},
	{
		id: 'mctan_airport',
		name: 'Mactan-Cebu International Airport (MCIA)',
		shortDescription: 'Airport Road, Lapu-Lapu City',
		coordinate: [10.3075, 123.9792],
		category: 'transit',
		icon: 'plane'
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
