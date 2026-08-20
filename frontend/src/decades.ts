export type DecadeCount = { decade: string; count: number };

export function aggregateDecades(tracks: { releaseYear: number }[]): DecadeCount[] {
  const counts = new Map<number, number>();

  for (const track of tracks) {
    const decadeStart = Math.floor(track.releaseYear / 10) * 10;
    counts.set(decadeStart, (counts.get(decadeStart) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decadeStart, count]) => ({ decade: `${decadeStart}s`, count }));
}
