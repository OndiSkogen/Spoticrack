import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";

type Me = { isOwner: boolean };
type Invites = { pending: number; used: { displayName: string }[] };

export function InviteManager() {
  const [isOwner, setIsOwner] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [invites, setInvites] = useState<Invites | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me").then((result) => {
      if (result.kind === "unauthenticated") {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      if (result.kind === "ok" && result.data.isOwner) {
        setIsOwner(true);
        loadInvites();
      }
    });
  }, []);

  async function loadInvites() {
    const result = await apiGet<Invites>("/api/invites");
    if (result.kind === "ok") setInvites(result.data);
  }

  async function createInvite() {
    await apiPost("/api/invites");
    loadInvites();
  }

  if (!signedIn || !isOwner || invites === null) return null;

  return (
    <section>
      <h2>Invite a friend</h2>
      <p>{invites.pending} pending invite{invites.pending === 1 ? "" : "s"}</p>
      {invites.used.length > 0 && (
        <ul>
          {invites.used.map((u, i) => (
            <li key={i}>{u.displayName} joined</li>
          ))}
        </ul>
      )}
      <button onClick={createInvite}>Invite a friend</button>
    </section>
  );
}
