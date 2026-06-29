import { prisma } from "@/lib/prisma";

// Skitourenguru publishes all route geometry in its public GitHub repo
// (https://github.com/skitourenguru/Routes). A track-view link like
// https://www.skitourenguru.ch/track-view?area=ch&id=265 maps directly onto a
// "composition" (id) per region, whose `segments` reference LineString
// geometries (EPSG:2056 / Swiss LV95) in the corresponding segments file.
// We assemble those segments into a MultiLineString and store it as GeoJSON,
// the same way the Schweizmobil import does.

const RAW_BASE =
  "https://raw.githubusercontent.com/skitourenguru/Routes/main";

// URL `area` param → repo folder + id offset.
// The web app encodes Italy-West tracks by adding 1000 to the id (see the
// track-view route handler in the site's bundle); the repo stores them under
// the same offset Italy compositions.
const AREA_MAP: Record<string, { folder: string; idOffset: number }> = {
  ch: { folder: "Switzerland", idOffset: 0 },
  au: { folder: "Austria", idOffset: 0 },
  fr: { folder: "France", idOffset: 0 },
  it: { folder: "Italy", idOffset: 0 },
  ie: { folder: "Italy", idOffset: 0 },
  iw: { folder: "Italy", idOffset: 1000 },
  de: { folder: "Germany", idOffset: 0 },
};

// Swisstopo approximate formula for Swiss (LV95/LV03) → WGS84.
// Auto-detects LV95 (E > 2M) vs LV03 (E < 1M).
function swissToWgs84(easting: number, northing: number): [number, number] {
  if (easting > 2000000) {
    easting -= 2000000;
    northing -= 1000000;
  }
  const y = (easting - 600000) / 1000000;
  const x = (northing - 200000) / 1000000;

  const lambdaS =
    2.6779094 +
    4.728982 * y +
    0.791484 * y * x +
    0.1306 * y * x * x -
    0.0436 * y * y * y;

  const phiS =
    16.9023892 +
    3.238272 * x -
    0.270978 * y * y -
    0.002528 * x * x -
    0.0447 * y * y * x -
    0.014 * x * x * x;

  return [(lambdaS * 100) / 36, (phiS * 100) / 36];
}

function extractAreaId(url: string): { area: string; id: number } | null {
  try {
    const parsed = new URL(url);
    const area = (parsed.searchParams.get("area") || "").toLowerCase();
    const id = parseInt(parsed.searchParams.get("id") || "", 10);
    if (!area || !Number.isFinite(id)) return null;
    return { area, id };
  } catch {
    return null;
  }
}

interface Composition {
  name: string;
  segments: number[];
}

interface AreaData {
  compositions: Map<number, Composition>;
  segments: Map<number, number[][]>;
}

// Cache assembled region data for the lifetime of a single batch request so we
// fetch each (large) segments file at most once.
async function loadAreaData(
  area: string,
  cache: Map<string, AreaData>
): Promise<AreaData> {
  const cached = cache.get(area);
  if (cached) return cached;

  const mapping = AREA_MAP[area];
  if (!mapping) throw new Error(`Unbekannte Region: ${area}`);

  const [compRes, segRes] = await Promise.all([
    fetch(`${RAW_BASE}/${mapping.folder}/${mapping.folder}_Compositions.geojson`, {
      signal: AbortSignal.timeout(60000),
    }),
    fetch(`${RAW_BASE}/${mapping.folder}/${mapping.folder}_Segments.geojson`, {
      signal: AbortSignal.timeout(60000),
    }),
  ]);

  if (!compRes.ok) throw new Error(`Compositions ${compRes.status}`);
  if (!segRes.ok) throw new Error(`Segments ${segRes.status}`);

  const compJson = await compRes.json();
  const segJson = await segRes.json();

  const compositions = new Map<number, Composition>();
  for (const f of compJson.features || []) {
    const p = f.properties || {};
    if (typeof p.id !== "number") continue;
    const segments = String(p.segments || "")
      .split(",")
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => Number.isFinite(n));
    compositions.set(p.id, { name: p.name || "", segments });
  }

  const segments = new Map<number, number[][]>();
  for (const f of segJson.features || []) {
    const p = f.properties || {};
    const geom = f.geometry;
    if (typeof p.id !== "number" || geom?.type !== "LineString") continue;
    segments.set(p.id, geom.coordinates as number[][]);
  }

  const data: AreaData = { compositions, segments };
  cache.set(area, data);
  return data;
}

// Computes bounds, center and total length over a MultiLineString, summing
// Haversine distance only within each line (segments of a route are graph edges
// and do not form one continuous polyline, so we must not bridge the gaps).
function computeMultiLineStats(lines: number[][][]) {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  let totalLat = 0,
    totalLng = 0,
    count = 0,
    totalDistance = 0;

  const R = 6371000;
  for (const line of lines) {
    for (const coord of line) {
      const [lng, lat] = coord;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      totalLat += lat;
      totalLng += lng;
      count++;
    }
    for (let i = 1; i < line.length; i++) {
      const [lng1, lat1] = line[i - 1];
      const [lng2, lat2] = line[i];
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
  }

  const bounds = [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
  const center = count > 0 ? [totalLat / count, totalLng / count] : [0, 0];
  return { bounds, center, distanceM: Math.round(totalDistance) };
}

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      // Find hikes with skitourenguru links that don't already have a GPX file
      const hikesWithLinks = await prisma.hike.findMany({
        where: {
          gpxFile: null,
          links: {
            some: {
              url: { contains: "skitourenguru" },
            },
          },
        },
        include: {
          links: {
            where: { url: { contains: "skitourenguru" } },
          },
        },
      });

      const total = hikesWithLinks.length;
      send("start", { total });

      const areaCache = new Map<string, AreaData>();
      let success = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < hikesWithLinks.length; i++) {
        const hike = hikesWithLinks[i];

        // Find the first link with a valid area + id
        let parsed: { area: string; id: number } | null = null;
        for (const link of hike.links) {
          parsed = extractAreaId(link.url);
          if (parsed) break;
        }

        if (!parsed) {
          skipped++;
          send("progress", {
            current: i + 1,
            total,
            hikeName: hike.name,
            status: "skipped",
            message: "Keine area/id im Link",
            success,
            skipped,
            errors,
          });
          continue;
        }

        try {
          const areaData = await loadAreaData(parsed.area, areaCache);
          const mapping = AREA_MAP[parsed.area];
          const composition = areaData.compositions.get(
            parsed.id + mapping.idOffset
          );

          if (!composition) {
            errors++;
            send("progress", {
              current: i + 1,
              total,
              hikeName: hike.name,
              status: "error",
              message: `Route ${parsed.id} nicht gefunden`,
              success,
              skipped,
              errors,
            });
            continue;
          }

          // Assemble each segment into its own WGS84 LineString (MultiLineString)
          const lines: number[][][] = [];
          for (const segId of composition.segments) {
            const coords = areaData.segments.get(segId);
            if (!coords) continue;
            lines.push(
              coords.map((coord) => {
                const [lon, lat] = swissToWgs84(coord[0], coord[1]);
                return [lon, lat];
              })
            );
          }

          if (lines.length === 0) {
            errors++;
            send("progress", {
              current: i + 1,
              total,
              hikeName: hike.name,
              status: "error",
              message: "Keine Segment-Geometrie",
              success,
              skipped,
              errors,
            });
            continue;
          }

          const geojson = {
            type: "FeatureCollection" as const,
            features: [
              {
                type: "Feature" as const,
                properties: {
                  name: composition.name,
                  source: "skitourenguru",
                  area: parsed.area,
                  id: parsed.id,
                },
                geometry: {
                  type: "MultiLineString" as const,
                  coordinates: lines,
                },
              },
            ],
          };

          const { bounds, center, distanceM } = computeMultiLineStats(lines);

          await prisma.hikeGpxFile.create({
            data: {
              hikeId: hike.id,
              originalFilename: `skitourenguru-${parsed.area}-${parsed.id}.geojson`,
              mimeType: "application/geo+json",
              storagePath: `skitourenguru://${parsed.area}-${parsed.id}`,
              fileSizeBytes: JSON.stringify(geojson).length,
              geojson,
              routeBounds: bounds,
              routeCenter: center,
              routeDistanceM: distanceM,
            },
          });

          success++;
          send("progress", {
            current: i + 1,
            total,
            hikeName: hike.name,
            status: "success",
            success,
            skipped,
            errors,
          });
        } catch (e) {
          errors++;
          send("progress", {
            current: i + 1,
            total,
            hikeName: hike.name,
            status: "error",
            message: e instanceof Error ? e.message : "Unbekannt",
            success,
            skipped,
            errors,
          });
        }

        // Small delay to be polite to GitHub's raw endpoint
        await new Promise((r) => setTimeout(r, 200));
      }

      send("done", { total, success, skipped, errors });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
