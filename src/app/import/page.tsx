"use client";

import { useState, useRef } from "react";

type AppState = "idle" | "uploading" | "previewing" | "committing" | "done";

type SchweizmobilState = "idle" | "importing" | "done";

interface SchweizmobilProgress {
  current: number;
  total: number;
  hikeName: string;
  status: "success" | "skipped" | "error";
  message?: string;
  success: number;
  skipped: number;
  errors: number;
}

interface SchweizmobilDone {
  total: number;
  success: number;
  skipped: number;
  errors: number;
}

interface PreviewRow {
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

interface PreviewResult {
  rowCount: number;
  preview: PreviewRow[];
  warnings: string[];
}

interface CommitResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export default function ImportPage() {
  const [state, setState] = useState<AppState>("idle");
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [smState, setSmState] = useState<SchweizmobilState>("idle");
  const [smProgress, setSmProgress] = useState<SchweizmobilProgress | null>(null);
  const [smDone, setSmDone] = useState<SchweizmobilDone | null>(null);
  const [smError, setSmError] = useState<string | null>(null);

  const [sgState, setSgState] = useState<SchweizmobilState>("idle");
  const [sgProgress, setSgProgress] = useState<SchweizmobilProgress | null>(null);
  const [sgDone, setSgDone] = useState<SchweizmobilDone | null>(null);
  const [sgError, setSgError] = useState<string | null>(null);

  async function runRouteImport(
    endpoint: string,
    setState: (s: SchweizmobilState) => void,
    setProgress: (p: SchweizmobilProgress | null) => void,
    setDone: (d: SchweizmobilDone | null) => void,
    setErr: (e: string | null) => void
  ) {
    setState("importing");
    setErr(null);
    setProgress(null);
    setDone(null);

    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Kein Stream verfügbar");

      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (eventType === "progress") {
              setProgress(data as SchweizmobilProgress);
            } else if (eventType === "done") {
              setDone(data as SchweizmobilDone);
              setState("done");
              finished = true;
            }
          }
        }
      }

      if (!finished) setState("done");
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Unbekannter Fehler");
      setState("idle");
    }
  }

  function handleSchweizmobilImport() {
    return runRouteImport(
      "/api/import/schweizmobil",
      setSmState,
      setSmProgress,
      setSmDone,
      setSmError
    );
  }

  function handleSkitourenguruImport() {
    return runRouteImport(
      "/api/import/skitourenguru",
      setSgState,
      setSgProgress,
      setSgDone,
      setSgError
    );
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Bitte eine Excel-Datei auswählen.");
      return;
    }
    setState("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/excel/preview", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: PreviewResult = await res.json();
      setPreviewData(data);
      setState("previewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setState("idle");
    }
  }

  async function handleCommit() {
    if (!previewData) return;
    setState("committing");
    setError(null);

    try {
      const res = await fetch("/api/import/excel/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: previewData.preview }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: CommitResult = await res.json();
      setCommitResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setState("previewing");
    }
  }

  function handleReset() {
    setState("idle");
    setPreviewData(null);
    setCommitResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Excel-Import</h1>
      <p className="text-sm text-gray-500">
        Einmaliger Import der bestehenden Touren-Daten aus einer Excel-Datei.
      </p>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: File upload */}
      {(state === "idle" || state === "uploading") && (
        <div className="rounded border bg-white p-6">
          <form onSubmit={handlePreview} className="space-y-4">
            <div>
              <label htmlFor="file" className="block text-sm font-medium">
                Excel-Datei (.xlsx)
              </label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".xlsx"
                ref={fileRef}
                className="mt-1 block w-full text-sm"
                disabled={state === "uploading"}
              />
            </div>
            <button
              type="submit"
              disabled={state === "uploading"}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {state === "uploading" ? "Wird geladen…" : "Vorschau laden"}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Preview table */}
      {state === "previewing" && previewData && (
        <div className="rounded border bg-white p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                Vorschau — {previewData.rowCount} Touren gefunden
              </h2>
              {previewData.warnings.length > 0 && (
                <p className="text-sm text-yellow-600">
                  {previewData.warnings.length} Warnung(en) — einige Felder
                  konnten nicht geparst werden
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Zurück
              </button>
              <button
                onClick={handleCommit}
                className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
              >
                {previewData.rowCount} Touren importieren
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Vorschau der ersten {Math.min(10, previewData.preview.length)} von{" "}
            {previewData.rowCount} Zeilen:
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="border px-3 py-2">Name</th>
                  <th className="border px-3 py-2">Region</th>
                  <th className="border px-3 py-2">Sportart</th>
                  <th className="border px-3 py-2">Schwierigkeit</th>
                  <th className="border px-3 py-2">Distanz (km)</th>
                </tr>
              </thead>
              <tbody>
                {previewData.preview.slice(0, 10).map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="border px-3 py-2 font-medium">{row.name}</td>
                    <td className="border px-3 py-2 text-gray-600">
                      {row.region ?? "—"}
                    </td>
                    <td className="border px-3 py-2 text-gray-600">
                      {row.activityType ?? "—"}
                    </td>
                    <td className="border px-3 py-2 text-gray-600">
                      {row.difficultyRaw ?? "—"}
                    </td>
                    <td className="border px-3 py-2 text-gray-600">
                      {row.distanceKm !== null
                        ? row.distanceKm.toFixed(1)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewData.warnings.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-yellow-700 hover:text-yellow-800">
                {previewData.warnings.length} Warnung(en) anzeigen
              </summary>
              <ul className="mt-2 space-y-1 pl-4 text-yellow-700">
                {previewData.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Step 3: Committing spinner */}
      {state === "committing" && (
        <div className="rounded border bg-white p-6 text-center text-gray-500">
          Import läuft…
        </div>
      )}

      {/* Step 4: Done */}
      {state === "done" && commitResult && (
        <div className="rounded border bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-green-700">
            Import abgeschlossen
          </h2>
          <p className="text-2xl font-bold">
            {commitResult.imported} importiert,{" "}
            {commitResult.skipped} übersprungen
          </p>

          {commitResult.errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-medium text-red-700">
                {commitResult.errors.length} Fehler:
              </p>
              <ul className="space-y-1 text-sm text-red-600">
                {commitResult.errors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleReset}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Weiteren Import starten
          </button>
        </div>
      )}

      {/* Schweizmobil GPX Import */}
      <hr className="my-8 border-gray-200" />
      <h2 className="text-xl font-bold">Schweizmobil-Routen importieren</h2>
      <p className="text-sm text-gray-500">
        Touren mit Schweizmobil-Links werden automatisch mit Kartendaten
        ergänzt. Bereits vorhandene GPX-Dateien werden übersprungen.
      </p>

      {smError && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {smError}
        </div>
      )}

      {smState === "idle" && (
        <button
          onClick={handleSchweizmobilImport}
          className="rounded bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
        >
          Schweizmobil-Routen laden
        </button>
      )}

      {smState === "importing" && (
        <div className="rounded border bg-white p-6 space-y-4">
          {smProgress ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">
                  {smProgress.current} / {smProgress.total}
                </span>
                <span className="text-gray-500">
                  {Math.round((smProgress.current / smProgress.total) * 100)}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-300"
                  style={{
                    width: `${(smProgress.current / smProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-600 truncate">
                {smProgress.status === "success" && "✓ "}
                {smProgress.status === "skipped" && "⏭ "}
                {smProgress.status === "error" && "✗ "}
                {smProgress.hikeName}
                {smProgress.message && (
                  <span className="text-gray-400"> — {smProgress.message}</span>
                )}
              </p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="text-green-600">✓ {smProgress.success}</span>
                <span>⏭ {smProgress.skipped}</span>
                <span className="text-red-600">✗ {smProgress.errors}</span>
              </div>
            </>
          ) : (
            <p className="text-center text-gray-500">Verbindung wird aufgebaut…</p>
          )}
        </div>
      )}

      {smState === "done" && smDone && (
        <div className="rounded border bg-white p-6 space-y-4">
          <h3 className="text-lg font-semibold text-green-700">
            Schweizmobil-Import abgeschlossen
          </h3>
          <div className="flex gap-6 text-sm">
            <span className="text-green-700 font-medium">
              ✓ {smDone.success} erfolgreich
            </span>
            <span className="text-gray-500">
              ⏭ {smDone.skipped} übersprungen
            </span>
            {smDone.errors > 0 && (
              <span className="text-red-600">
                ✗ {smDone.errors} Fehler
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setSmState("idle");
              setSmDone(null);
              setSmProgress(null);
            }}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Erneut ausführen
          </button>
        </div>
      )}

      {/* Skitourenguru GPX Import */}
      <hr className="my-8 border-gray-200" />
      <h2 className="text-xl font-bold">Skitourenguru-Routen importieren</h2>
      <p className="text-sm text-gray-500">
        Touren mit Skitourenguru-Links werden mit Routengeometrie aus dem
        öffentlichen skitourenguru/Routes-Datensatz ergänzt. Bereits vorhandene
        GPX-Dateien werden übersprungen. Hinweis: ohne Höhendaten.
      </p>

      {sgError && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {sgError}
        </div>
      )}

      {sgState === "idle" && (
        <button
          onClick={handleSkitourenguruImport}
          className="rounded bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
        >
          Skitourenguru-Routen laden
        </button>
      )}

      {sgState === "importing" && (
        <div className="rounded border bg-white p-6 space-y-4">
          {sgProgress ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">
                  {sgProgress.current} / {sgProgress.total}
                </span>
                <span className="text-gray-500">
                  {Math.round((sgProgress.current / sgProgress.total) * 100)}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-300"
                  style={{
                    width: `${(sgProgress.current / sgProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-600 truncate">
                {sgProgress.status === "success" && "✓ "}
                {sgProgress.status === "skipped" && "⏭ "}
                {sgProgress.status === "error" && "✗ "}
                {sgProgress.hikeName}
                {sgProgress.message && (
                  <span className="text-gray-400"> — {sgProgress.message}</span>
                )}
              </p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="text-green-600">✓ {sgProgress.success}</span>
                <span>⏭ {sgProgress.skipped}</span>
                <span className="text-red-600">✗ {sgProgress.errors}</span>
              </div>
            </>
          ) : (
            <p className="text-center text-gray-500">Verbindung wird aufgebaut…</p>
          )}
        </div>
      )}

      {sgState === "done" && sgDone && (
        <div className="rounded border bg-white p-6 space-y-4">
          <h3 className="text-lg font-semibold text-green-700">
            Skitourenguru-Import abgeschlossen
          </h3>
          <div className="flex gap-6 text-sm">
            <span className="text-green-700 font-medium">
              ✓ {sgDone.success} erfolgreich
            </span>
            <span className="text-gray-500">
              ⏭ {sgDone.skipped} übersprungen
            </span>
            {sgDone.errors > 0 && (
              <span className="text-red-600">✗ {sgDone.errors} Fehler</span>
            )}
          </div>
          <button
            onClick={() => {
              setSgState("idle");
              setSgDone(null);
              setSgProgress(null);
            }}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Erneut ausführen
          </button>
        </div>
      )}
    </div>
  );
}
