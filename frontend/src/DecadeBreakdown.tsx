import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { groupYearsByDecade, type DecadeGroup } from "./decades";

type TrackItem = {
  id: string;
  name: string;
  artists: string;
  albumImage: string | null;
  releaseYear: number;
};

export function DecadeBreakdown() {
  const [groups, setGroups] = useState<DecadeGroup[] | null>(null);
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
          setGroups(groupYearsByDecade(result.data.items));
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) return null;
  if (error) return <p className="error-text">Couldn't load your decade breakdown: {error}</p>;
  if (groups === null || groups.length === 0) return null;

  const maxYearCount = Math.max(...groups.flatMap((g) => g.years.map((y) => y.count)));

  return (
    <section className="panel">
      <h2>Decade breakdown</h2>
      {groups.map((g) => (
        <div key={g.decade} className="decade-group">
          <div className="decade-group__header">
            <h3>{g.decade}</h3>
            <span className="decade-group__count">{g.count}</span>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {g.years.map((y) => (
              <li key={y.year} className="bar-row">
                <span className="bar-label">{y.year}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    aria-hidden="true"
                    style={{ width: `${(y.count / maxYearCount) * 100}%` }}
                  />
                </div>
                <span className="bar-count">{y.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
