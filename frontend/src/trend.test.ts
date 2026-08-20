import { describe, expect, it } from "vitest";
import { buildTrendSeries } from "./trend";

describe("buildTrendSeries", () => {
  it("returns an empty points array per tracked id when there are no snapshots", () => {
    expect(buildTrendSeries([], ["a"])).toEqual([{ id: "a", points: [] }]);
  });

  it("captures the rank for a tracked id on each date it appears", () => {
    const snapshots = [
      { capturedAt: "2026-08-18", items: [{ id: "a", rank: 3 }] },
      { capturedAt: "2026-08-19", items: [{ id: "a", rank: 1 }] },
    ];

    expect(buildTrendSeries(snapshots, ["a"])).toEqual([
      {
        id: "a",
        points: [
          { capturedAt: "2026-08-18", rank: 3 },
          { capturedAt: "2026-08-19", rank: 1 },
        ],
      },
    ]);
  });

  it("records a null rank for a date where the tracked id dropped out", () => {
    const snapshots = [
      { capturedAt: "2026-08-18", items: [{ id: "a", rank: 1 }] },
      { capturedAt: "2026-08-19", items: [{ id: "b", rank: 1 }] },
    ];

    expect(buildTrendSeries(snapshots, ["a"])).toEqual([
      {
        id: "a",
        points: [
          { capturedAt: "2026-08-18", rank: 1 },
          { capturedAt: "2026-08-19", rank: null },
        ],
      },
    ]);
  });

  it("builds independent series for multiple tracked ids", () => {
    const snapshots = [
      {
        capturedAt: "2026-08-18",
        items: [
          { id: "a", rank: 1 },
          { id: "b", rank: 2 },
        ],
      },
    ];

    expect(buildTrendSeries(snapshots, ["a", "b"])).toEqual([
      { id: "a", points: [{ capturedAt: "2026-08-18", rank: 1 }] },
      { id: "b", points: [{ capturedAt: "2026-08-18", rank: 2 }] },
    ]);
  });
});
