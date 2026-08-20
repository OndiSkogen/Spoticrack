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
  if (error) return <p className="error-text">Couldn't load your decade breakdown: {error}</p>;
  if (decadeCounts === null || decadeCounts.length === 0) return null;

  const max = Math.max(...decadeCounts.map((dc) => dc.count));

  return (
    <section className="panel">
      <h2>Decade breakdown</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {decadeCounts.map((dc) => (
          <li key={dc.decade} className="bar-row">
            <span className="bar-label">{dc.decade}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                aria-hidden="true"
                style={{ width: `${(dc.count / max) * 100}%` }}
              />
            </div>
            <span className="bar-count">{dc.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
