import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { buildTrendSeries, type TrendSnapshot } from "./trend";

type TopItem = { id: string; name: string };

const COLORS = ["#5b6bd6", "#d65b8a", "#5bd6a0", "#d6a05b", "#8a5bd6"];
const TRACKED_COUNT = 5;
const WIDTH = 480;
const HEIGHT = 200;
const PADDING = 24;

export function TrendChart() {
  const [signedIn, setSignedIn] = useState(true);
  const [topItems, setTopItems] = useState<TopItem[] | null>(null);
  const [snapshots, setSnapshots] = useState<TrendSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet<{ items: TopItem[] }>("/api/top?type=tracks&time_range=medium_term"),
      apiGet<{ snapshots: TrendSnapshot[] }>("/api/trend?type=tracks&time_range=medium_term"),
    ]).then(([topResult, trendResult]) => {
      if (cancelled) return;

      if (topResult.kind === "unauthenticated" || trendResult.kind === "unauthenticated") {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);

      if (topResult.kind === "error") {
        setError(topResult.message);
        return;
      }
      if (trendResult.kind === "error") {
        setError(trendResult.message);
        return;
      }

      setTopItems(topResult.data.items);
      setSnapshots(trendResult.data.snapshots);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) return null;
  if (error) return <p className="error-text">Couldn't load your trend chart: {error}</p>;
  if (topItems === null || snapshots === null) return null;
  if (snapshots.length < 2) return null; // not enough history to plot a trend yet

  const tracked = topItems.slice(0, TRACKED_COUNT);
  const series = buildTrendSeries(
    snapshots,
    tracked.map((t) => t.id),
  );

  const allRanks = series
    .flatMap((s) => s.points.map((p) => p.rank))
    .filter((r): r is number => r !== null);
  const minRank = Math.min(...allRanks);
  const maxRank = Math.max(...allRanks);
  const n = snapshots.length;

  function x(i: number): number {
    return n === 1 ? WIDTH / 2 : PADDING + (i / (n - 1)) * (WIDTH - 2 * PADDING);
  }

  function y(rank: number): number {
    if (maxRank === minRank) return HEIGHT / 2;
    return PADDING + ((rank - minRank) / (maxRank - minRank)) * (HEIGHT - 2 * PADDING);
  }

  return (
    <section className="panel">
      <h2>Trend: top tracks over time</h2>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" style={{ maxWidth: 600, display: "block" }}>
        {series.map((s, seriesIndex) => {
          const color = COLORS[seriesIndex % COLORS.length];
          const segments: { cx: number; cy: number }[][] = [];
          let current: { cx: number; cy: number }[] = [];

          s.points.forEach((p, i) => {
            if (p.rank === null) {
              if (current.length) segments.push(current);
              current = [];
            } else {
              current.push({ cx: x(i), cy: y(p.rank) });
            }
          });
          if (current.length) segments.push(current);

          return (
            <g key={s.id}>
              {segments.map((seg, segIndex) => (
                <polyline
                  key={segIndex}
                  points={seg.map((pt) => `${pt.cx},${pt.cy}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="legend-row" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {tracked.map((t, i) => (
          <li key={t.id}>
            <span
              className="legend-dot"
              aria-hidden="true"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {t.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
