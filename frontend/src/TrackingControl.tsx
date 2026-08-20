import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";

type Me = { trackingOptIn: boolean };

export function TrackingControl() {
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me").then((result) => {
      if (result.kind === "unauthenticated") {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      if (result.kind === "ok") setOptIn(result.data.trackingOptIn);
    });
  }, []);

  async function toggle() {
    const next = !optIn;
    setOptIn(next);
    await apiPost("/api/tracking", { optIn: next });
  }

  async function captureNow() {
    setSnapshotStatus("Capturing…");
    const result = await apiPost("/api/snapshot/run");
    if (result.kind === "ok") {
      setSnapshotStatus("Snapshot captured.");
    } else if (result.kind === "error") {
      setSnapshotStatus(`Couldn't capture a snapshot: ${result.message}`);
    } else {
      setSnapshotStatus(null);
    }
  }

  if (!signedIn || optIn === null) return null;

  return (
    <section className="panel panel-row">
      <label className="checkbox-row">
        <input type="checkbox" checked={optIn} onChange={toggle} />
        Track my listening history over time
      </label>
      <div>
        <button className="btn" onClick={captureNow}>
          Capture snapshot now
        </button>
        {snapshotStatus && (
          <p className="eyebrow" style={{ textAlign: "right", marginTop: 8 }}>
            {snapshotStatus}
          </p>
        )}
      </div>
    </section>
  );
}
