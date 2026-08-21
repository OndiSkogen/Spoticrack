import { useEffect, useState } from "react";
import { apiGet } from "./api";

type TopType = "tracks" | "artists";
type TimeRange = "short_term" | "medium_term" | "long_term";

type TrackItem = { id: string; name: string; artists: string; albumImage: string | null };
type ArtistItem = { id: string; name: string; image: string | null };

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "short_term", label: "Last 4 weeks" },
  { value: "medium_term", label: "Last 6 months" },
  { value: "long_term", label: "Last 12 months" },
];

const COUNTS = [10, 25, 50] as const;
type Count = (typeof COUNTS)[number];

function isTrack(item: TrackItem | ArtistItem): item is TrackItem {
  return "artists" in item;
}

export function TopItems() {
  const [type, setType] = useState<TopType>("tracks");
  const [timeRange, setTimeRange] = useState<TimeRange>("medium_term");
  const [count, setCount] = useState<Count>(10);
  const [items, setItems] = useState<(TrackItem | ArtistItem)[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);

    apiGet<{ items: (TrackItem | ArtistItem)[] }>(
      `/api/top?type=${type}&time_range=${timeRange}`,
    ).then((result) => {
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        setSignedIn(false);
      } else if (result.kind === "error") {
        setSignedIn(true);
        setError(result.message);
      } else {
        setSignedIn(true);
        setItems(result.data.items);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [type, timeRange]);

  const visibleItems = items?.slice(0, count) ?? null;

  if (!signedIn) return null;

  return (
    <section className="panel">
      <div className="panel-row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Top {type === "tracks" ? "tracks" : "artists"}</h2>
        <div role="group" aria-label="Item type" className="pill-group">
          <button
            className="pill"
            aria-pressed={type === "tracks"}
            onClick={() => setType("tracks")}
          >
            Tracks
          </button>
          <button
            className="pill"
            aria-pressed={type === "artists"}
            onClick={() => setType("artists")}
          >
            Artists
          </button>
        </div>
      </div>
      <div role="group" aria-label="Time range" className="pill-group" style={{ marginBottom: 16 }}>
        {TIME_RANGES.map((tr) => (
          <button
            key={tr.value}
            className="pill"
            aria-pressed={timeRange === tr.value}
            onClick={() => setTimeRange(tr.value)}
          >
            {tr.label}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Result count" className="pill-group" style={{ marginBottom: 16 }}>
        {COUNTS.map((c) => (
          <button
            key={c}
            className="pill"
            aria-pressed={count === c}
            onClick={() => setCount(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {error ? (
        <p className="error-text">
          Couldn't load your top {type}: {error}
        </p>
      ) : visibleItems === null ? (
        <p className="eyebrow">Loading…</p>
      ) : (
        <ol className="item-list">
          {visibleItems.map((item, index) => (
            <li key={item.id} className="item-row">
              <span className="item-rank">{index + 1}</span>
              <span>
                <div className="item-name">{item.name}</div>
                {isTrack(item) && <div className="item-sub">{item.artists}</div>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
