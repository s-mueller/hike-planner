export function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function parseGermanBool(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "ja";
  }
  return false;
}

export function parseInteger(
  value: unknown,
  fieldName: string,
  warnings: string[],
  rowNum: number
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const n = Math.round(value);
    return isNaN(n) ? null : n;
  }
  const str = String(value).replace(/[^\d-]/g, "");
  if (!str || str === "-") {
    warnings.push(`Zeile ${rowNum}: Ungültiger Ganzzahlwert für "${fieldName}": "${value}"`);
    return null;
  }
  const num = parseInt(str, 10);
  if (isNaN(num)) {
    warnings.push(`Zeile ${rowNum}: Ungültiger Ganzzahlwert für "${fieldName}": "${value}"`);
    return null;
  }
  return num;
}

export function parseDecimal(
  value: unknown,
  fieldName: string,
  warnings: string[],
  rowNum: number
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return isNaN(value) ? null : Math.round(value * 100) / 100;
  }
  const str = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
  if (!str) {
    warnings.push(`Zeile ${rowNum}: Ungültiger Dezimalwert für "${fieldName}": "${value}"`);
    return null;
  }
  const num = parseFloat(str);
  if (isNaN(num)) {
    warnings.push(`Zeile ${rowNum}: Ungültiger Dezimalwert für "${fieldName}": "${value}"`);
    return null;
  }
  return Math.round(num * 100) / 100;
}
