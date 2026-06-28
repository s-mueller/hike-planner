import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { DOMParser } from "@xmldom/xmldom";
import * as toGeoJSON from "@tmcw/togeojson";
import { extractBoundsAndCenter, calculateRouteDistance } from "@/lib/gpx-utils";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const hike = await prisma.hike.findUnique({ where: { id } });
  if (!hike) {
    return NextResponse.json({ error: "Hike not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("gpx") as File | null;

  if (!file || !file.name.endsWith(".gpx")) {
    return NextResponse.json(
      { error: "A valid .gpx file is required" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${randomUUID()}.gpx`;
  const dir = join(UPLOAD_DIR, "gpx");
  await mkdir(dir, { recursive: true });
  const storagePath = join(dir, filename);
  await writeFile(storagePath, buffer);

  // Parse GPX to GeoJSON
  let geojson: GeoJSON.FeatureCollection | null = null;
  let routeBounds: number[][] | null = null;
  let routeCenter: number[] | null = null;
  let routeDistanceM: number | null = null;

  try {
    const gpxText = buffer.toString("utf-8");
    const doc = new DOMParser().parseFromString(gpxText, "application/xml");
    geojson = toGeoJSON.gpx(doc as unknown as Document) as GeoJSON.FeatureCollection;

    const boundsData = extractBoundsAndCenter(geojson);
    if (boundsData) {
      routeBounds = boundsData.bounds;
      routeCenter = boundsData.center;
    }
    routeDistanceM = calculateRouteDistance(geojson);
  } catch {
    // GPX parsing failed — store file but skip geojson
  }

  const gpxFile = await prisma.hikeGpxFile.upsert({
    where: { hikeId: id },
    create: {
      hikeId: id,
      originalFilename: file.name,
      mimeType: "application/gpx+xml",
      storagePath,
      fileSizeBytes: buffer.length,
      geojson: geojson ? JSON.parse(JSON.stringify(geojson)) : undefined,
      routeBounds: routeBounds ? JSON.parse(JSON.stringify(routeBounds)) : undefined,
      routeCenter: routeCenter ? JSON.parse(JSON.stringify(routeCenter)) : undefined,
      routeDistanceM: routeDistanceM ?? undefined,
    },
    update: {
      originalFilename: file.name,
      storagePath,
      fileSizeBytes: buffer.length,
      geojson: geojson ? JSON.parse(JSON.stringify(geojson)) : null,
      routeBounds: routeBounds ? JSON.parse(JSON.stringify(routeBounds)) : null,
      routeCenter: routeCenter ? JSON.parse(JSON.stringify(routeCenter)) : null,
      routeDistanceM: routeDistanceM ?? null,
    },
  });

  return NextResponse.json(gpxFile, { status: 201 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.hikeGpxFile.delete({ where: { hikeId: id } });
  return new NextResponse(null, { status: 204 });
}
