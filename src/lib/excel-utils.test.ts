import { describe, it, expect } from "vitest";
import { simpleHash, parseGermanBool, parseInteger, parseDecimal } from "./excel-utils";

describe("simpleHash", () => {
  it("returns an 8-character hex string", () => {
    expect(simpleHash("test")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic", () => {
    expect(simpleHash("Matterhorn|Wallis|Zermatt|Zermatt|Wandern")).toBe(
      simpleHash("Matterhorn|Wallis|Zermatt|Zermatt|Wandern")
    );
  });

  it("produces different hashes for different inputs", () => {
    expect(simpleHash("abc")).not.toBe(simpleHash("xyz"));
  });

  it("handles empty string", () => {
    expect(simpleHash("")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("parseGermanBool", () => {
  it('returns true for "ja"', () => expect(parseGermanBool("ja")).toBe(true));
  it('returns true for "Ja" (case-insensitive)', () => expect(parseGermanBool("Ja")).toBe(true));
  it('returns true for "JA"', () => expect(parseGermanBool("JA")).toBe(true));
  it('returns true for " ja " (with whitespace)', () => expect(parseGermanBool(" ja ")).toBe(true));
  it('returns false for "nein"', () => expect(parseGermanBool("nein")).toBe(false));
  it('returns false for ""', () => expect(parseGermanBool("")).toBe(false));
  it("returns false for non-string values", () => {
    expect(parseGermanBool(1)).toBe(false);
    expect(parseGermanBool(true)).toBe(false);
    expect(parseGermanBool(null)).toBe(false);
    expect(parseGermanBool(undefined)).toBe(false);
  });
});

describe("parseInteger", () => {
  it("returns null for empty string", () => {
    expect(parseInteger("", "f", [], 1)).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(parseInteger(null, "f", [], 1)).toBeNull();
    expect(parseInteger(undefined, "f", [], 1)).toBeNull();
  });

  it("parses a plain number", () => {
    expect(parseInteger(1200, "f", [], 1)).toBe(1200);
  });

  it("rounds a decimal number input", () => {
    expect(parseInteger(1200.7, "f", [], 1)).toBe(1201);
  });

  it("parses a numeric string", () => {
    expect(parseInteger("1200", "f", [], 1)).toBe(1200);
  });

  it("strips non-numeric characters from string", () => {
    expect(parseInteger("1'200 m", "f", [], 1)).toBe(1200);
  });

  it("adds a warning for an invalid string and returns null", () => {
    const warnings: string[] = [];
    const result = parseInteger("abc", "Höhe", warnings, 5);
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Zeile 5");
    expect(warnings[0]).toContain("Höhe");
  });

  it("adds a warning for lone minus sign", () => {
    const warnings: string[] = [];
    expect(parseInteger("-", "f", warnings, 2)).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});

describe("parseDecimal", () => {
  it("returns null for empty/null/undefined", () => {
    expect(parseDecimal("", "f", [], 1)).toBeNull();
    expect(parseDecimal(null, "f", [], 1)).toBeNull();
    expect(parseDecimal(undefined, "f", [], 1)).toBeNull();
  });

  it("parses a float number", () => {
    expect(parseDecimal(12.5, "f", [], 1)).toBe(12.5);
  });

  it("rounds to 2 decimal places", () => {
    expect(parseDecimal(12.555, "f", [], 1)).toBe(12.56);
  });

  it("parses a German decimal string (comma separator)", () => {
    expect(parseDecimal("12,5", "Distanz", [], 1)).toBe(12.5);
  });

  it("parses a standard decimal string", () => {
    expect(parseDecimal("12.5", "f", [], 1)).toBe(12.5);
  });

  it("adds a warning for an invalid string", () => {
    const warnings: string[] = [];
    const result = parseDecimal("abc", "Distanz", warnings, 3);
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Zeile 3");
    expect(warnings[0]).toContain("Distanz");
  });

  it("returns null for NaN number", () => {
    expect(parseDecimal(NaN, "f", [], 1)).toBeNull();
  });
});
