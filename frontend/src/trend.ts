export type TrendSnapshot = { capturedAt: string; items: { id: string; rank: number }[] };

// D1 stores capturedAt as SQLite's `datetime('now')` output ("YYYY-MM-DD HH:MM:SS", UTC),
// which isn't valid ISO 8601 on its own (needs a "T" separator) - normalize before parsing.
function parseCapturedAt(capturedAt: string): Date {
  const iso = capturedAt.includes(" ") ? `${capturedAt.replace(" ", "T")}Z` : `${capturedAt}T00:00:00Z`;
  return new Date(iso);
}

export function formatDay(capturedAt: string): string {
  return parseCapturedAt(capturedAt).toLocaleDateString("en-US", {
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonth(capturedAt: string): string {
  return parseCapturedAt(capturedAt).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

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
