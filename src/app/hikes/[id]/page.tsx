"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import GpxUpload from "@/components/GpxUpload";

const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

interface HikeLink {
  id: string;
  url: string;
  position: number;
}

interface GpxFile {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  uploadedAt: string;
  geojson: GeoJSON.FeatureCollection | null;
  routeBounds: number[][] | null;
  routeCenter: number[] | null;
  routeDistanceM: number | null;
}

interface Hike {
  id: string;
  name: string;
  region: string | null;
  activityType: string | null;
  difficultyRaw: string | null;
  maxElevationM: number | null;
  ascentM: number | null;
  descentM: number | null;
  distanceKm: string | null;
  isMultiDay: boolean;
  isLoop: boolean;
  startLocation: string | null;
  endLocation: string | null;
  destinationType: string | null;
  usesCableCar: boolean;
  season: string | null;
  status: string;
  completedDate: string | null;
  notes: string | null;
  source: string;
  createdAt: string;
  links: HikeLink[];
  gpxFile: GpxFile | null;
}

export default function HikeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [hike, setHike] = useState<Hike | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [hikeId, setHikeId] = useState<string>("");

  async function fetchHike(id: string) {
    try {
      const res = await fetch(`/api/hikes/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Tour nicht gefunden" : `Fehler: ${res.status}`);
      setHike(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function reload() {
    if (hikeId) fetchHike(hikeId);
  }

  useEffect(() => {
    async function load() {
      const { id } = await params;
      setHikeId(id);
      fetchHike(id);
    }
    load();
  }, [params]);

  async function toggleComplete() {
    if (!hike) return;
    setActing(true);
    try {
      if (hike.status === "completed") {
        const res = await fetch(`/api/hikes/${hike.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "planned", completedDate: null }),
        });
        if (!res.ok) throw new Error("Fehler beim Zurücksetzen");
        setHike(await res.json());
      } else {
        const res = await fetch(`/api/hikes/${hike.id}/complete`, { method: "POST" });
        if (!res.ok) throw new Error("Fehler beim Abschliessen");
        setHike(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setActing(false);
    }
  }

  async function deleteHike() {
    if (!hike || !confirm("Tour wirklich löschen?")) return;
    setActing(true);
    try {
      const res = await fetch(`/api/hikes/${hike.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Fehler beim Löschen");
      router.push("/hikes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setActing(false);
    }
  }

  if (loading) return <p className="text-gray-500">Laden...</p>;
  if (error) return <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!hike) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{hike.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-500">
            {hike.region && <span>{hike.region}</span>}
            {hike.activityType && <span>• {hike.activityType}</span>}
            {hike.difficultyRaw && <span>• {hike.difficultyRaw}</span>}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
            hike.status === "completed"
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {hike.status === "completed" ? "Erledigt" : "Geplant"}
        </span>
      </div>

      {/* Stats grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {hike.distanceKm && (
          <StatCard label="Distanz" value={`${hike.distanceKm} km`} />
        )}
        {hike.ascentM && (
          <StatCard label="Aufstieg" value={`${hike.ascentM} m`} />
        )}
        {hike.descentM && (
          <StatCard label="Abstieg" value={`${hike.descentM} m`} />
        )}
        {hike.maxElevationM && (
          <StatCard label="Max Höhe" value={`${hike.maxElevationM} m`} />
        )}
      </section>

      {/* Details */}
      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">Details</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {hike.startLocation && (
            <div>
              <dt className="text-gray-500">Start</dt>
              <dd className="font-medium">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hike.startLocation)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {hike.startLocation} ↗
                </a>
              </dd>
            </div>
          )}
          {hike.endLocation && (
            <div>
              <dt className="text-gray-500">Ziel</dt>
              <dd className="font-medium">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hike.endLocation)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {hike.endLocation} ↗
                </a>
              </dd>
            </div>
          )}
          {hike.destinationType && <DlItem label="Zielart" value={hike.destinationType} />}
          {hike.season && <DlItem label="Saison" value={hike.season} />}
          <DlItem label="Mehrtagestour" value={hike.isMultiDay ? "Ja" : "Nein"} />
          <DlItem label="Rundtour" value={hike.isLoop ? "Ja" : "Nein"} />
          <DlItem label="Seilbahn" value={hike.usesCableCar ? "Ja" : "Nein"} />
          <DlItem label="Quelle" value={hike.source === "imported" ? "Excel-Import" : hike.source} />
          {hike.completedDate && (
            <DlItem label="Abgeschlossen am" value={new Date(hike.completedDate).toLocaleDateString("de-CH")} />
          )}
        </dl>
        {hike.notes && (
          <div className="mt-3 border-t pt-3">
            <p className="text-sm font-medium text-gray-600">Notizen</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{hike.notes}</p>
          </div>
        )}
      </section>

      {/* Links */}
      {hike.links.length > 0 && (
        <section className="rounded border bg-white p-4">
          <h2 className="mb-3 font-semibold">Links</h2>
          <ul className="space-y-1">
            {hike.links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  {link.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* GPX / Map */}
      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">Karte / GPX</h2>
        {hike.gpxFile ? (
          <div className="space-y-3">
            {hike.gpxFile.geojson && (
              <RouteMap
                geojson={hike.gpxFile.geojson}
                bounds={hike.gpxFile.routeBounds ?? undefined}
                center={hike.gpxFile.routeCenter ?? undefined}
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <span className="min-w-0 break-all">
                {hike.gpxFile.originalFilename} ({Math.round(hike.gpxFile.fileSizeBytes / 1024)} KB)
                {hike.gpxFile.routeDistanceM != null && (
                  <> — {(hike.gpxFile.routeDistanceM / 1000).toFixed(1)} km</>
                )}
              </span>
              <button
                onClick={async () => {
                  if (!confirm("GPX-Datei löschen?")) return;
                  await fetch(`/api/hikes/${hike.id}/gpx`, { method: "DELETE" });
                  reload();
                }}
                className="shrink-0 text-red-600 hover:underline"
              >
                Löschen
              </button>
            </div>
          </div>
        ) : (
          <GpxUpload hikeId={hike.id} onUploaded={reload} />
        )}
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 border-t pt-4">
        <button
          onClick={toggleComplete}
          disabled={acting}
          className={`rounded px-4 py-2 text-sm font-medium text-white ${
            hike.status === "completed"
              ? "bg-yellow-600 hover:bg-yellow-700"
              : "bg-green-600 hover:bg-green-700"
          } disabled:opacity-50`}
        >
          {hike.status === "completed" ? "Zurücksetzen" : "Als erledigt markieren"}
        </button>
        <Link
          href={`/hikes/${hike.id}/edit`}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Bearbeiten
        </Link>
        <button
          onClick={deleteHike}
          disabled={acting}
          className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Löschen
        </button>
        <Link
          href="/hikes"
          className="ml-auto rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          ← Zurück
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function DlItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
