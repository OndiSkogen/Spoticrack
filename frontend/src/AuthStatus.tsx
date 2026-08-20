import { useEffect, useState } from "react";

type Me = { displayName: string };

export function AuthStatus() {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  function checkSession() {
    fetch("/api/me")
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((data) => {
        setMe(data);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
  }

  if (!checked) return null;

  if (!me) {
    return <a href="/api/auth/login">Sign in with Spotify</a>;
  }

  return (
    <p>
      Signed in as {me.displayName} <button onClick={signOut}>Sign out</button>
    </p>
  );
}
