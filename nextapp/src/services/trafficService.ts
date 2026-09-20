import { Coordinate, TrafficDot, TrafficLevel } from "../types/navigation";

export interface TrafficSegmentZone {
  roadName: string;
  level: TrafficLevel;
  centerCoordinate: Coordinate;
  radiusKm: number;
}

// Calculate distance between two coordinates in kilometers using Haversine formula
export function haversineDistanceKm(
  coord1: Coordinate,
  coord2: Coordinate,
): number {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Interpolate coordinates along polyline to place evenly spaced colored traffic dots
export function generateTrafficDots(
  polyline: Coordinate[],
  knownTrafficZones: TrafficSegmentZone[] = [],
): TrafficDot[] {
  if (polyline.length < 2) return [];

  const dots: TrafficDot[] = [];
  let dotIndex = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const start = polyline[i];
    const end = polyline[i + 1];
    const segmentDist = haversineDistanceKm(start, end);

    // Generate a dot roughly every 100 meters (0.1 km)
    const numPoints = Math.max(1, Math.floor(segmentDist / 0.12));

    for (let j = 0; j < numPoints; j++) {
      const ratio = j / numPoints;
      const lat = start[0] + (end[0] - start[0]) * ratio;
      const lng = start[1] + (end[1] - start[1]) * ratio;
      const point: Coordinate = [lat, lng];

      // Check if point falls within any known traffic zone
      let level: TrafficLevel = "light";
      let roadName = "Main Corridor";
      let speedKmH = 45;

      const matchedZone = knownTrafficZones.find(
        (zone) =>
          haversineDistanceKm(point, zone.centerCoordinate) <= zone.radiusKm,
      );

      if (matchedZone) {
        level = matchedZone.level;
        roadName = matchedZone.roadName;
        speedKmH = level === "heavy" ? 12 : 25;
      } else {
        // Naturally vary traffic based on coordinate hashing or road segment position
        const pseudoRandom = Math.abs(Math.sin(lat * 1000 + lng * 500));
        if (pseudoRandom > 0.82) {
          level = "heavy";
          speedKmH = 10;
          roadName = "Congested Segment";
        } else if (pseudoRandom > 0.55) {
          level = "moderate";
          speedKmH = 26;
          roadName = "Slow Moving Section";
        } else {
          level = "light";
          speedKmH = 48;
          roadName = "Clear Road";
        }
      }

      dots.push({
        id: `tdot_${dotIndex++}`,
        coordinate: point,
        level,
        roadName,
        speedKmH,
      });
    }
  }

  return dots;
}
