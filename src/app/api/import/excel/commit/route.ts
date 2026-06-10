import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ImportRow {
  name: string;
  region: string | null;
  activityType: string | null;
  difficultyRaw: string | null;
  maxElevationM: number | null;
  ascentM: number | null;
  descentM: number | null;
  distanceKm: number | null;
  isMultiDay: boolean;
  isLoop: boolean;
  startLocation: string | null;
  endLocation: string | null;
  destinationType: string | null;
  usesCableCar: boolean;
  season: string | null;
  links: string[];
  importHash: string;
}

export async function POST(request: Request) {
  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger JSON-Body" },
      { status: 400 }
    );
  }

  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "Keine Zeilen übergeben" },
      { status: 400 }
    );
  }

  const typedRows = rows as ImportRow[];

  // Fetch all existing importHashes in one query for efficient deduplication
  const incomingHashes = typedRows
    .map((r) => r.importHash)
    .filter((h): h is string => Boolean(h));

  const existingHikes = await prisma.hike.findMany({
    where: { importHash: { in: incomingHashes } },
    select: { importHash: true },
  });
  const existingHashes = new Set(
    existingHikes
      .map((h: { importHash: string | null }) => h.importHash)
      .filter(Boolean)
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of typedRows) {
    if (existingHashes.has(row.importHash)) {
      skipped++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const hike = await tx.hike.create({
          data: {
            name: row.name,
            region: row.region,
            activityType: row.activityType,
            difficultyRaw: row.difficultyRaw,
            maxElevationM: row.maxElevationM,
            ascentM: row.ascentM,
            descentM: row.descentM,
            distanceKm:
              row.distanceKm !== null && row.distanceKm !== undefined
                ? String(row.distanceKm)
                : null,
            isMultiDay: row.isMultiDay ?? false,
            isLoop: row.isLoop ?? false,
            startLocation: row.startLocation,
            endLocation: row.endLocation,
            destinationType: row.destinationType,
            usesCableCar: row.usesCableCar ?? false,
            season: row.season,
            source: "imported",
            status: "planned",
            importHash: row.importHash,
          },
        });

        if (Array.isArray(row.links) && row.links.length > 0) {
          await tx.hikeLink.createMany({
            data: row.links.map((url: string, idx: number) => ({
              hikeId: hike.id,
              position: idx + 1,
              url,
            })),
          });
        }
      });

      imported++;
    } catch (err) {
      errors.push(
        `Fehler bei "${row.name}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return NextResponse.json({ imported, skipped, errors });
}
