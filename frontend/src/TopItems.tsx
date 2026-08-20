import { useEffect, useState } from "react";

type TopType = "tracks" | "artists";
type TimeRange = "short_term" | "medium_term" | "long_term";

type TrackItem = { id: string; name: string; artists: string; albumImage: string | null };
type ArtistItem = { id: string; name: string; genres: string[]; image: string | null };

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

  useEffect(() => {
    let cancelled = false;
    setItems(null);

    fetch(`/api/top?type=${type}&time_range=${timeRange}`).then((res) => {
      if (cancelled) return;
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      res.json().then((data: { items: (TrackItem | ArtistItem)[] }) => {
        if (!cancelled) setItems(data.items);
      });
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
      {items === null ? (
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
