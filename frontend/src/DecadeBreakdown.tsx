import { useEffect, useState } from "react";
import { apiGet } from "./api";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiGet<{ items: TrackItem[] }>("/api/top?type=tracks&time_range=medium_term").then(
      (result) => {
        if (cancelled) return;
        if (result.kind === "unauthenticated") {
          setSignedIn(false);
        } else if (result.kind === "error") {
          setSignedIn(true);
          setError(result.message);
        } else {
          setSignedIn(true);
          setDecadeCounts(aggregateDecades(result.data.items));
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) return null;
  if (error) return <p>Couldn't load your decade breakdown: {error}</p>;
  if (decadeCounts === null || decadeCounts.length === 0) return null;

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
