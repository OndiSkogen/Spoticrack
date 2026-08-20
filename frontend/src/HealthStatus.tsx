import { useEffect, useState } from "react";
import { apiUrl } from "./api";

type Health = { status: string; db: string };

export function HealthStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(apiUrl("/api/health"))
      .then((res) => res.json() as Promise<Health>)
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setUnreachable(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (unreachable) return <p>API unreachable</p>;
  if (!health) return <p>Checking…</p>;

  return (
    <p>
      API: {health.status} · DB: {health.db}
    </p>
  );
}
