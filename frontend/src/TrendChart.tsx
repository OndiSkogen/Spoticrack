import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { buildTrendSeries, formatDay, formatMonth, type TrendSnapshot } from "./trend";

type TopItem = { id: string; name: string };

const COUNTS = [5, 10, 15, 25] as const;
type Count = (typeof COUNTS)[number];

const TIME_FRAMES = [
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
] as const;
type Days = (typeof TIME_FRAMES)[number]["value"];

function colorForIndex(index: number, total: number): string {
  const hue = Math.round((360 * index) / Math.max(total, 1));
  return `hsl(${hue}deg 65% 55%)`;
}

const WIDTH = 480;
const HEIGHT = 200;
const PADDING = 24;
const LABEL_AREA = 34;

export function TrendChart() {
  const [signedIn, setSignedIn] = useState(true);
  const [count, setCount] = useState<Count>(5);
  const [days, setDays] = useState<Days>(14);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  const visibleSnapshots = snapshots.slice(-days);
  if (visibleSnapshots.length < 2) return null; // not enough history to plot a trend yet

  const tracked = topItems.slice(0, count);
  const series = buildTrendSeries(
    visibleSnapshots,
    tracked.map((t) => t.id),
  );

  const allRanks = series
    .flatMap((s) => s.points.map((p) => p.rank))
    .filter((r): r is number => r !== null);
  const minRank = Math.min(...allRanks);
  const maxRank = Math.max(...allRanks);
  const n = visibleSnapshots.length;

  function x(i: number): number {
    return n === 1 ? WIDTH / 2 : PADDING + (i / (n - 1)) * (WIDTH - 2 * PADDING);
  }

  function y(rank: number): number {
    if (maxRank === minRank) return HEIGHT / 2;
    return PADDING + ((rank - minRank) / (maxRank - minRank)) * (HEIGHT - 2 * PADDING);
  }

  return (
    <section className="panel">
      <div className="panel-row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Trend: top tracks over time</h2>
        <div role="group" aria-label="Track count" className="pill-group">
          {COUNTS.map((c) => (
            <button key={c} className="pill" aria-pressed={count === c} onClick={() => setCount(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Time frame" className="pill-group" style={{ marginBottom: 16 }}>
        {TIME_FRAMES.map((tf) => (
          <button
            key={tf.value}
            className="pill"
            aria-pressed={days === tf.value}
            onClick={() => setDays(tf.value)}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT + LABEL_AREA}`}
        width="100%"
        style={{ maxWidth: 600, display: "block" }}
      >
        {visibleSnapshots.map((snap, i) => {
          const month = formatMonth(snap.capturedAt);
          const isNewMonth = i === 0 || month !== formatMonth(visibleSnapshots[i - 1].capturedAt);
          return (
            <g key={snap.capturedAt}>
              <text className="axis-day" x={x(i)} y={HEIGHT + 14} fontSize={9} fill="var(--muted)" textAnchor="middle">
                {formatDay(snap.capturedAt)}
              </text>
              {isNewMonth && (
                <text
                  className="axis-month"
                  x={x(i)}
                  y={HEIGHT + 28}
                  fontSize={9}
                  fontWeight={600}
                  fill="var(--accent)"
                  textAnchor="middle"
                >
                  {month}
                </text>
              )}
            </g>
          );
        })}
        {series.map((s, seriesIndex) => {
          const color = colorForIndex(seriesIndex, tracked.length);
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

          const isHovered = hoveredId === s.id;
          const isDimmed = hoveredId !== null && !isHovered;

          return (
            <g
              key={s.id}
              data-series-id={s.id}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {segments.map((seg, segIndex) => (
                <g key={segIndex}>
                  <polyline
                    points={seg.map((pt) => `${pt.cx},${pt.cy}`).join(" ")}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ cursor: "pointer" }}
                  />
                  <polyline
                    points={seg.map((pt) => `${pt.cx},${pt.cy}`).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={isHovered ? 4 : 2}
                    opacity={isDimmed ? 0.25 : 1}
                  />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="legend-row" style={{ listStyle: "none", padding: 0, margin: 0, marginTop: 5 }}>
        {tracked.map((t, i) => {
          const isHovered = hoveredId === t.id;
          const isDimmed = hoveredId !== null && !isHovered;
          return (
            <li
              key={t.id}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                cursor: "pointer",
                opacity: isDimmed ? 0.5 : 1,
                fontWeight: isHovered ? 600 : 400,
              }}
            >
              <span
                className="legend-dot"
                aria-hidden="true"
                style={{ background: colorForIndex(i, tracked.length) }}
              />
              {t.name}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
