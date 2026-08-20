import { describe, expect, it } from "vitest";
import { groupYearsByDecade } from "./decades";

describe("groupYearsByDecade", () => {
  it("returns an empty list for no tracks", () => {
    expect(groupYearsByDecade([])).toEqual([]);
  });

  it("groups a single track under its year and decade", () => {
    expect(groupYearsByDecade([{ releaseYear: 2015 }])).toEqual([
      { decade: "2010s", count: 1, years: [{ year: 2015, count: 1 }] },
    ]);
  });

  it("sums multiple tracks in the same year", () => {
    const result = groupYearsByDecade([{ releaseYear: 2015 }, { releaseYear: 2015 }]);
    expect(result).toEqual([{ decade: "2010s", count: 2, years: [{ year: 2015, count: 2 }] }]);
  });

  it("groups multiple years under the same decade, years sorted ascending", () => {
    const result = groupYearsByDecade([
      { releaseYear: 2019 },
      { releaseYear: 2015 },
      { releaseYear: 2015 },
      { releaseYear: 2011 },
    ]);

    expect(result).toEqual([
      {
        decade: "2010s",
        count: 4,
        years: [
          { year: 2011, count: 1 },
          { year: 2015, count: 2 },
          { year: 2019, count: 1 },
        ],
      },
    ]);
  });

  it("sorts decade groups chronologically ascending", () => {
    const result = groupYearsByDecade([
      { releaseYear: 2018 },
      { releaseYear: 1995 },
      { releaseYear: 2003 },
    ]);

    expect(result.map((g) => g.decade)).toEqual(["1990s", "2000s", "2010s"]);
  });
});
