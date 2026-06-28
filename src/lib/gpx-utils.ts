export function extractBoundsAndCenter(geojson: GeoJSON.FeatureCollection): {
  bounds: number[][];
  center: number[];
} | null {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;

  function processCoords(coords: number[]) {
    const [lng, lat] = coords;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  function walkGeometry(geometry: GeoJSON.Geometry) {
    if (geometry.type === "Point") {
      processCoords(geometry.coordinates);
    } else if (geometry.type === "LineString" || geometry.type === "MultiPoint") {
      geometry.coordinates.forEach(processCoords);
    } else if (geometry.type === "Polygon" || geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((ring) => ring.forEach(processCoords));
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((poly) =>
        poly.forEach((ring) => ring.forEach(processCoords))
      );
    } else if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(walkGeometry);
    }
  }

  for (const feature of geojson.features) {
    if (feature.geometry) walkGeometry(feature.geometry);
  }

  if (minLat === Infinity) return null;

  return {
    bounds: [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
    center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
  };
}

export function calculateRouteDistance(geojson: GeoJSON.FeatureCollection): number {
  let totalDistance = 0;

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    const geom = feature.geometry;
    if (geom.type === "LineString") {
      for (let i = 1; i < geom.coordinates.length; i++) {
        const [lng1, lat1] = geom.coordinates[i - 1];
        const [lng2, lat2] = geom.coordinates[i];
        totalDistance += haversine(lat1, lng1, lat2, lng2);
      }
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) {
        for (let i = 1; i < line.length; i++) {
          const [lng1, lat1] = line[i - 1];
          const [lng2, lat2] = line[i];
          totalDistance += haversine(lat1, lng1, lat2, lng2);
        }
      }
    }
  }

  return Math.round(totalDistance * 100) / 100;
}
