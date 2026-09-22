import { handleRainfall } from '$lib/server/rainfallApi';
export const POST = ({ request }: { request: Request }) => handleRainfall(request, 'hazards');
