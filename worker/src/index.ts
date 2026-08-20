import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { decrypt, encrypt, importEncryptionKey } from "./crypto";
import { generateCodeChallenge, generateCodeVerifier } from "./pkce";

export type Env = {
  DB: D1Database;
  SPOTIFY_CLIENT_ID: string;
  SESSION_SECRET: string;
  REFRESH_TOKEN_ENCRYPTION_KEY: string;
};

type SpotifyProfile = {
  account_id: string;
  display_name: string | null;
};

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token: string;
};

const SCOPES = "user-read-private user-read-email user-top-read";
const PKCE_COOKIE = "spoticrack_pkce";
const SESSION_COOKIE = "spoticrack_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", db: "ok" });
});

app.get("/api/auth/login", async (c) => {
  const verifier = generateCodeVerifier();
  const state = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  await setSignedCookie(
    c,
    PKCE_COOKIE,
    JSON.stringify({ verifier, state }),
    c.env.SESSION_SECRET,
    { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" },
  );

  const redirectUri = new URL("/api/auth/callback", c.req.url).toString();

  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", c.env.SPOTIFY_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("state", state);

  return c.redirect(authorizeUrl.toString(), 302);
});

app.get("/api/auth/callback", async (c) => {
  const cookieValue = await getSignedCookie(c, c.env.SESSION_SECRET, PKCE_COOKIE);
  deleteCookie(c, PKCE_COOKIE, { path: "/" });

  if (!cookieValue) {
    return c.json(
      { error: "Your login session expired or is invalid. Please try signing in again." },
      400,
    );
  }

  const { verifier, state } = JSON.parse(cookieValue) as { verifier: string; state: string };

  const url = new URL(c.req.url);
  const spotifyError = url.searchParams.get("error");
  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (spotifyError) {
    return c.json({ error: `Spotify sign-in failed: ${spotifyError}` }, 400);
  }
  if (!code || returnedState !== state) {
    return c.json(
      { error: "Login session mismatch. Please try signing in again." },
      400,
    );
  }

  const redirectUri = new URL("/api/auth/callback", c.req.url).toString();

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: c.env.SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    return c.json({ error: `Spotify token exchange failed: ${await tokenRes.text()}` }, 502);
  }

  const tokens = await tokenRes.json<SpotifyTokenResponse>();

  const profileRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    return c.json(
      { error: `Failed to fetch your Spotify profile: ${await profileRes.text()}` },
      502,
    );
  }

  const profile = await profileRes.json<SpotifyProfile>();

  const userCount = await c.env.DB.prepare("SELECT count(*) AS n FROM users").first<{
    n: number;
  }>();
  const isFirstEverUser = (userCount?.n ?? 0) === 0;

  const existing = await c.env.DB.prepare(
    "SELECT 1 FROM users WHERE spotify_account_id = ?",
  )
    .bind(profile.account_id)
    .first();

  if (!isFirstEverUser && !existing) {
    return c.json(
      { error: "This Spotify account hasn't been invited to Spoticrack." },
      403,
    );
  }

  const encryptionKey = await importEncryptionKey(c.env.REFRESH_TOKEN_ENCRYPTION_KEY);
  const encryptedRefreshToken = await encrypt(tokens.refresh_token, encryptionKey);

  await c.env.DB.prepare(
    `INSERT INTO users (spotify_account_id, display_name, refresh_token_enc)
     VALUES (?, ?, ?)
     ON CONFLICT(spotify_account_id) DO UPDATE SET
       display_name = excluded.display_name,
       refresh_token_enc = excluded.refresh_token_enc`,
  )
    .bind(profile.account_id, profile.display_name ?? "Spotify User", encryptedRefreshToken)
    .run();

  await setSignedCookie(c, SESSION_COOKIE, profile.account_id, c.env.SESSION_SECRET, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return c.redirect("/", 302);
});

app.get("/api/me", async (c) => {
  const accountId = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!accountId) {
    return c.json({ error: "Not signed in." }, 401);
  }

  const user = await c.env.DB.prepare(
    "SELECT refresh_token_enc FROM users WHERE spotify_account_id = ?",
  )
    .bind(accountId)
    .first<{ refresh_token_enc: string }>();

  if (!user) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Not signed in." }, 401);
  }

  const encryptionKey = await importEncryptionKey(c.env.REFRESH_TOKEN_ENCRYPTION_KEY);
  const refreshToken = await decrypt(user.refresh_token_enc, encryptionKey);

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: c.env.SPOTIFY_CLIENT_ID,
    }),
  });

  if (!tokenRes.ok) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Your Spotify session expired. Please sign in again." }, 401);
  }

  const tokens = await tokenRes.json<{ access_token: string; refresh_token?: string }>();

  if (tokens.refresh_token) {
    const reEncrypted = await encrypt(tokens.refresh_token, encryptionKey);
    await c.env.DB.prepare("UPDATE users SET refresh_token_enc = ? WHERE spotify_account_id = ?")
      .bind(reEncrypted, accountId)
      .run();
  }

  const profileRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    return c.json(
      { error: `Failed to fetch your Spotify profile: ${await profileRes.text()}` },
      502,
    );
  }

  const profile = await profileRes.json<SpotifyProfile>();
  return c.json({ displayName: profile.display_name ?? "Spotify User" });
});

app.post("/api/auth/logout", async (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export default app;
