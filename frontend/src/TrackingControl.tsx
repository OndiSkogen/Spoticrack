import { useEffect, useState } from "react";

export function TrackingControl() {
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me").then((res) => {
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      res.json().then((data: { trackingOptIn: boolean }) => setOptIn(data.trackingOptIn));
    });
  }, []);

  async function toggle() {
    const next = !optIn;
    setOptIn(next);
    await fetch("/api/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optIn: next }),
    });
  }

  async function captureNow() {
    setSnapshotStatus("Capturing…");
    const res = await fetch("/api/snapshot/run", { method: "POST" });
    setSnapshotStatus(res.ok ? "Snapshot captured." : "Failed to capture snapshot.");
  }

  if (!signedIn || optIn === null) return null;

  return (
    <section>
      <label>
        <input type="checkbox" checked={optIn} onChange={toggle} />
        Track my listening history over time
      </label>
      <button onClick={captureNow}>Capture snapshot now</button>
      {snapshotStatus && <p>{snapshotStatus}</p>}
    </section>
  );
}
