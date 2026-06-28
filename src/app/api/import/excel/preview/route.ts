import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { simpleHash, parseGermanBool, parseInteger, parseDecimal } from "@/lib/excel-utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || !file.name.endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Eine gültige .xlsx-Datei wird benötigt" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "Die Arbeitsmappe enthält kein Tabellenblatt" },
        { status: 400 }
      );
    }
    const sheet = workbook.Sheets[sheetName];

    // raw:true keeps numeric cells as numbers; defval:"" fills empty cells
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
      blankrows: false,
    });

    const warnings: string[] = [];
    const preview: unknown[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // row 1 = header, data starts at row 2

      const name = String(row["Titel"] ?? "").trim();
      if (!name) {
        warnings.push(
          `Zeile ${rowNum}: Leerer Titel — Zeile wird übersprungen`
        );
        continue;
      }

      const region = String(row["Region"] ?? "").trim() || null;
      const activityType = String(row["Sportart"] ?? "").trim() || null;
      const difficultyRaw = String(row["Schwierigkeit"] ?? "").trim() || null;
      const startLocation = String(row["Start"] ?? "").trim() || null;
      const endLocation = String(row["Ziel"] ?? "").trim() || null;
      const destinationType = String(row["Zielart"] ?? "").trim() || null;
      const season = String(row["Saison"] ?? "").trim() || null;

      const maxElevationM = parseInteger(
        row["Max Höhe"],
        "Max Höhe",
        warnings,
        rowNum
      );
      const ascentM = parseInteger(
        row["Aufstieg"],
        "Aufstieg",
        warnings,
        rowNum
      );
      const descentM = parseInteger(
        row["Abstieg"],
        "Abstieg",
        warnings,
        rowNum
      );
      const distanceKm = parseDecimal(
        row["Distanz"],
        "Distanz",
        warnings,
        rowNum
      );

      const isMultiDay = parseGermanBool(row["Mehrtagestour"]);
      const isLoop = parseGermanBool(row["Rundtour"]);
      const usesCableCar = parseGermanBool(row["Seilbahn?"]);

      // Collect Link 1–5, drop empty values
      const links: string[] = [];
      for (let l = 1; l <= 5; l++) {
        const link = String(row[`Link ${l}`] ?? "").trim();
        if (link) links.push(link);
      }

      // importHash: stable fingerprint for deduplication
      const hashInput = [
        name,
        region ?? "",
        startLocation ?? "",
        endLocation ?? "",
        activityType ?? "",
      ].join("|");
      const importHash = simpleHash(hashInput);

      preview.push({
        name,
        region,
        activityType,
        difficultyRaw,
        maxElevationM,
        ascentM,
        descentM,
        distanceKm,
        isMultiDay,
        isLoop,
        startLocation,
        endLocation,
        destinationType,
        usesCableCar,
        season,
        links,
        importHash,
      });
    }

    return NextResponse.json({
      rowCount: preview.length,
      preview,
      warnings,
    });
  } catch (err) {
    console.error("Excel preview error:", err);
    return NextResponse.json(
      { error: "Fehler beim Verarbeiten der Excel-Datei" },
      { status: 500 }
    );
  }
}
