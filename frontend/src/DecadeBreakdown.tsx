import { useEffect, useState } from "react";
import { aggregateDecades, type DecadeCount } from "./decades";

type TrackItem = {
  id: string;
  name: string;
  artists: string;
  albumImage: string | null;
  releaseYear: number;
};

export function DecadeBreakdown() {
  const [decadeCounts, setDecadeCounts] = useState<DecadeCount[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/top?type=tracks&time_range=medium_term").then((res) => {
      if (cancelled) return;
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      res.json().then((data: { items: TrackItem[] }) => {
        if (!cancelled) setDecadeCounts(aggregateDecades(data.items));
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn || decadeCounts === null || decadeCounts.length === 0) return null;

  const max = Math.max(...decadeCounts.map((dc) => dc.count));

  return (
    <section>
      <h2>Decade breakdown</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {decadeCounts.map((dc) => (
          <li
            key={dc.decade}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.25rem 0" }}
          >
            <span style={{ width: "6rem", textAlign: "right" }}>{dc.decade}</span>
            <div style={{ flex: 1, background: "#eee" }}>
              <div
                aria-hidden="true"
                style={{
                  width: `${(dc.count / max) * 100}%`,
                  background: "#5b6bd6",
                  height: "0.9rem",
                }}
              />
            </div>
            <span>{dc.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
