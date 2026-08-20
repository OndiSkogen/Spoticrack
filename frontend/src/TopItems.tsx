import { useEffect, useState } from "react";
import { apiGet } from "./api";

type TopType = "tracks" | "artists";
type TimeRange = "short_term" | "medium_term" | "long_term";

type TrackItem = { id: string; name: string; artists: string; albumImage: string | null };
type ArtistItem = { id: string; name: string; image: string | null };

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "short_term", label: "Last 4 weeks" },
  { value: "medium_term", label: "Last 6 months" },
  { value: "long_term", label: "All time" },
];

function isTrack(item: TrackItem | ArtistItem): item is TrackItem {
  return "artists" in item;
}

export function TopItems() {
  const [type, setType] = useState<TopType>("tracks");
  const [timeRange, setTimeRange] = useState<TimeRange>("medium_term");
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

  if (!signedIn) return null;

  return (
    <section>
      <div role="group" aria-label="Item type">
        <button aria-pressed={type === "tracks"} onClick={() => setType("tracks")}>
          Tracks
        </button>
        <button aria-pressed={type === "artists"} onClick={() => setType("artists")}>
          Artists
        </button>
      </div>
      <div role="group" aria-label="Time range">
        {TIME_RANGES.map((tr) => (
          <button
            key={tr.value}
            aria-pressed={timeRange === tr.value}
            onClick={() => setTimeRange(tr.value)}
          >
            {tr.label}
          </button>
        ))}
      </div>
      {error ? (
        <p>Couldn't load your top {type}: {error}</p>
      ) : items === null ? (
        <p>Loading…</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              {item.name}
              {isTrack(item) ? ` — ${item.artists}` : ""}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
