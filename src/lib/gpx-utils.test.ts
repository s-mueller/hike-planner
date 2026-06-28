import { describe, it, expect } from "vitest";
import { extractBoundsAndCenter, calculateRouteDistance } from "./gpx-utils";
import type { FeatureCollection } from "geojson";

function fc(features: GeoJSON.Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("extractBoundsAndCenter", () => {
  it("returns null for empty feature collection", () => {
    expect(extractBoundsAndCenter(fc([]))).toBeNull();
  });

  it("returns null for features without geometry", () => {
    const result = extractBoundsAndCenter(fc([{ type: "Feature", geometry: null as never, properties: {} }]));
    expect(result).toBeNull();
  });

  it("handles a single Point", () => {
    const result = extractBoundsAndCenter(
      fc([{ type: "Feature", geometry: { type: "Point", coordinates: [8.5, 47.3] }, properties: {} }])
    );
    expect(result).not.toBeNull();
    expect(result!.center).toEqual([47.3, 8.5]);
    expect(result!.bounds).toEqual([[47.3, 8.5], [47.3, 8.5]]);
  });

  it("computes correct bounds for a LineString", () => {
    const result = extractBoundsAndCenter(
      fc([{
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[8.0, 46.0], [9.0, 47.0], [8.5, 46.5]],
        },
        properties: {},
      }])
    );
    expect(result!.bounds[0]).toEqual([46.0, 8.0]); // [minLat, minLng]
    expect(result!.bounds[1]).toEqual([47.0, 9.0]); // [maxLat, maxLng]
    expect(result!.center[0]).toBeCloseTo(46.5);
    expect(result!.center[1]).toBeCloseTo(8.5);
  });

  it("handles MultiLineString", () => {
    const result = extractBoundsAndCenter(
      fc([{
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: [[[7.0, 45.0], [8.0, 46.0]], [[9.0, 47.0], [10.0, 48.0]]],
        },
        properties: {},
      }])
    );
    expect(result!.bounds[0]).toEqual([45.0, 7.0]);
    expect(result!.bounds[1]).toEqual([48.0, 10.0]);
  });

  it("handles Polygon", () => {
    const result = extractBoundsAndCenter(
      fc([{
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[8.0, 46.0], [9.0, 46.0], [9.0, 47.0], [8.0, 47.0], [8.0, 46.0]]],
        },
        properties: {},
      }])
    );
    expect(result!.bounds[0]).toEqual([46.0, 8.0]);
    expect(result!.bounds[1]).toEqual([47.0, 9.0]);
  });
});

describe("calculateRouteDistance", () => {
  it("returns 0 for empty feature collection", () => {
    expect(calculateRouteDistance(fc([]))).toBe(0);
  });

  it("returns 0 for features with no geometry", () => {
    expect(calculateRouteDistance(fc([{ type: "Feature", geometry: null as never, properties: {} }]))).toBe(0);
  });

  it("returns 0 for a single-point LineString", () => {
    const result = calculateRouteDistance(
      fc([{ type: "Feature", geometry: { type: "LineString", coordinates: [[8.5, 47.3]] }, properties: {} }])
    );
    expect(result).toBe(0);
  });

  it("computes non-zero distance for a two-point LineString", () => {
    // Roughly 111km per degree of latitude
    const result = calculateRouteDistance(
      fc([{
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[8.0, 47.0], [8.0, 48.0]] },
        properties: {},
      }])
    );
    expect(result).toBeGreaterThan(100000); // >100km in meters
    expect(result).toBeLessThan(120000);
  });

  it("accumulates distance across MultiLineString segments", () => {
    const singleLine = calculateRouteDistance(
      fc([{ type: "Feature", geometry: { type: "LineString", coordinates: [[8.0, 47.0], [8.0, 48.0]] }, properties: {} }])
    );
    const multiLine = calculateRouteDistance(
      fc([{
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: [[[8.0, 47.0], [8.0, 47.5]], [[8.0, 47.5], [8.0, 48.0]]],
        },
        properties: {},
      }])
    );
    expect(Math.abs(singleLine - multiLine)).toBeLessThan(1);
  });

  it("skips non-line geometry types", () => {
    const result = calculateRouteDistance(
      fc([{ type: "Feature", geometry: { type: "Point", coordinates: [8.0, 47.0] }, properties: {} }])
    );
    expect(result).toBe(0);
  });
});
