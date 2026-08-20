export type TrendSnapshot = { capturedAt: string; items: { id: string; rank: number }[] };
export type TrendPoint = { capturedAt: string; rank: number | null };
export type TrendSeries = { id: string; points: TrendPoint[] };

export function buildTrendSeries(
  snapshots: TrendSnapshot[],
  trackedIds: string[],
): TrendSeries[] {
  return trackedIds.map((id) => ({
    id,
    points: snapshots.map((snapshot) => {
      const match = snapshot.items.find((item) => item.id === id);
      return { capturedAt: snapshot.capturedAt, rank: match ? match.rank : null };
    }),
  }));
}
