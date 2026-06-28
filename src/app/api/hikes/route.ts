import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { decode } from "@auth/core/jwt";

async function getSessionUser(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get("authjs.session-token")?.value;
  if (!token) return "manual";
  try {
    const decoded = await decode({ token, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token" });
    return (decoded?.name as string) || "manual";
  } catch {
    return "manual";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const difficulty = searchParams.get("difficulty");
  const activityType = searchParams.get("activityType");
  const region = searchParams.get("region");
  const season = searchParams.get("season");
  const sort = searchParams.get("sort") ?? "newest";
  const search = searchParams.get("q");

  const where: Record<string, unknown> = {};

  if (status) where.status = status;
  if (difficulty) where.difficultyRaw = difficulty;
  if (activityType) where.activityType = activityType;
  if (region) where.region = region;
  if (season) where.season = season;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { region: { contains: search, mode: "insensitive" } },
      { startLocation: { contains: search, mode: "insensitive" } },
      { endLocation: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Record<string, string> =
    sort === "oldest" ? { createdAt: "asc" }
    : sort === "name_asc" ? { name: "asc" }
    : sort === "name_desc" ? { name: "desc" }
    : sort === "distance_asc" ? { distanceKm: "asc" }
    : sort === "distance_desc" ? { distanceKm: "desc" }
    : sort === "ascent_asc" ? { ascentM: "asc" }
    : sort === "ascent_desc" ? { ascentM: "desc" }
    : { createdAt: "desc" };

  const hikes = await prisma.hike.findMany({
    where,
    include: { links: true },
    orderBy,
  });

  return NextResponse.json(hikes);
}

export async function POST(request: Request) {
  const userName = await getSessionUser();
  const body = await request.json();

  const hike = await prisma.hike.create({
    data: {
      name: body.name,
      region: body.region ?? null,
      activityType: body.activityType ?? null,
      difficultyRaw: body.difficultyRaw ?? null,
      maxElevationM: body.maxElevationM ?? null,
      ascentM: body.ascentM ?? null,
      descentM: body.descentM ?? null,
      distanceKm: body.distanceKm ?? null,
      isMultiDay: body.isMultiDay ?? false,
      isLoop: body.isLoop ?? false,
      startLocation: body.startLocation ?? null,
      endLocation: body.endLocation ?? null,
      destinationType: body.destinationType ?? null,
      usesCableCar: body.usesCableCar ?? false,
      season: body.season ?? null,
      notes: body.notes ?? null,
      source: userName,
      links: body.links?.length
        ? { create: body.links.map((url: string, i: number) => ({ url, position: i + 1 })) }
        : undefined,
    },
  });

  return NextResponse.json(hike, { status: 201 });
}
