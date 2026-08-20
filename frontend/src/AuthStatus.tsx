import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, SESSION_EXPIRED_EVENT } from "./api";

type Me = { displayName: string };

export function AuthStatus() {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [expired, setExpired] = useState(false);
  const meRef = useRef<Me | null>(null);

  useEffect(() => {
    checkSession();

    function onSessionExpired() {
      if (meRef.current) setExpired(true);
      meRef.current = null;
      setMe(null);
      setChecked(true);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  async function checkSession() {
    const result = await apiGet<Me>("/api/me");
    const data = result.kind === "ok" ? result.data : null;
    meRef.current = data;
    setMe(data);
    setChecked(true);
  }

  async function signOut() {
    await apiPost("/api/auth/logout");
    meRef.current = null;
    setMe(null);
    setExpired(false);
  }

  if (!checked) return null;

  if (!me) {
    return (
      <div>
        {expired && <p className="error-text">Your session expired. Please sign in again.</p>}
        <a className="btn btn-accent" href="/api/auth/login">
          Sign in with Spotify
        </a>
      </div>
    );
  }

  return (
    <p className="eyebrow">
      Signed in as <strong style={{ color: "var(--text)" }}>{me.displayName}</strong>{" "}
      <button className="btn" onClick={signOut}>
        Sign out
      </button>
    </p>
  );
}
