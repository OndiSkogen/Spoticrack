export type YearCount = { year: number; count: number };
export type DecadeGroup = { decade: string; count: number; years: YearCount[] };

export function groupYearsByDecade(tracks: { releaseYear: number }[]): DecadeGroup[] {
  const yearCounts = new Map<number, number>();
  for (const track of tracks) {
    yearCounts.set(track.releaseYear, (yearCounts.get(track.releaseYear) ?? 0) + 1);
  }

  const decadeGroups = new Map<number, YearCount[]>();
  for (const [year, count] of yearCounts) {
    const decadeStart = Math.floor(year / 10) * 10;
    const years = decadeGroups.get(decadeStart) ?? [];
    years.push({ year, count });
    decadeGroups.set(decadeStart, years);
  }

  return [...decadeGroups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decadeStart, years]) => ({
      decade: `${decadeStart}s`,
      count: years.reduce((sum, y) => sum + y.count, 0),
      years: years.sort((a, b) => a.year - b.year),
    }));
}
