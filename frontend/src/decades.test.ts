import { describe, expect, it } from "vitest";
import { aggregateDecades } from "./decades";

describe("aggregateDecades", () => {
  it("returns an empty list for no tracks", () => {
    expect(aggregateDecades([])).toEqual([]);
  });

  it("buckets a release year into its decade", () => {
    expect(aggregateDecades([{ releaseYear: 2004 }])).toEqual([{ decade: "2000s", count: 1 }]);
  });

  it("sums counts for multiple tracks in the same decade", () => {
    const result = aggregateDecades([
      { releaseYear: 2001 },
      { releaseYear: 2009 },
      { releaseYear: 2015 },
    ]);

    expect(result).toEqual([
      { decade: "2000s", count: 2 },
      { decade: "2010s", count: 1 },
    ]);
  });

  it("sorts chronologically ascending regardless of input order", () => {
    const result = aggregateDecades([
      { releaseYear: 2018 },
      { releaseYear: 1995 },
      { releaseYear: 2003 },
    ]);

    expect(result.map((r) => r.decade)).toEqual(["1990s", "2000s", "2010s"]);
  });
});
