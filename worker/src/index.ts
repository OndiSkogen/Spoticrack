import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { encrypt, importEncryptionKey } from "./crypto";
import { generateCodeChallenge, generateCodeVerifier } from "./pkce";
import { pruneOldSnapshots, runScheduledSnapshots } from "./scheduled";
import { captureSnapshot } from "./snapshot";
import { fetchWithBackoff, getFreshAccessToken } from "./spotify";

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

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[]; release_date: string };
};

type SpotifyArtist = {
  id: string;
  name: string;
  images: { url: string }[];
};

const SCOPES = "user-read-private user-read-email user-top-read";
const TOP_TIME_RANGES = ["short_term", "medium_term", "long_term"] as const;
const TOP_LIMIT = 50;
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

  let unusedInviteId: number | null = null;

  if (!isFirstEverUser && !existing) {
    const invite = await c.env.DB.prepare(
      "SELECT id FROM invites WHERE used_by IS NULL ORDER BY created_at ASC LIMIT 1",
    ).first<{ id: number }>();

    if (!invite) {
      return c.json(
        { error: "This Spotify account hasn't been invited to Spoticrack." },
        403,
      );
    }
    unusedInviteId = invite.id;
  }

  const encryptionKey = await importEncryptionKey(c.env.REFRESH_TOKEN_ENCRYPTION_KEY);
  const encryptedRefreshToken = await encrypt(tokens.refresh_token, encryptionKey);

  await c.env.DB.prepare(
    `INSERT INTO users (spotify_account_id, display_name, refresh_token_enc, is_owner)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(spotify_account_id) DO UPDATE SET
       display_name = excluded.display_name,
       refresh_token_enc = excluded.refresh_token_enc`,
  )
    .bind(
      profile.account_id,
      profile.display_name ?? "Spotify User",
      encryptedRefreshToken,
      isFirstEverUser ? 1 : 0,
    )
    .run();

  if (unusedInviteId !== null) {
    await c.env.DB.prepare(
      "UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE id = ?",
    )
      .bind(profile.account_id, unusedInviteId)
      .run();
  }

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

  const accessToken = await getFreshAccessToken(c.env, accountId);
  if (!accessToken) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Your Spotify session expired. Please sign in again." }, 401);
  }

  const profileRes = await fetchWithBackoff(() =>
    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );

  if (!profileRes.ok) {
    return c.json(
      { error: `Failed to fetch your Spotify profile: ${await profileRes.text()}` },
      502,
    );
  }

  const profile = await profileRes.json<SpotifyProfile>();

  const user = await c.env.DB.prepare(
    "SELECT tracking_opt_in, is_owner FROM users WHERE spotify_account_id = ?",
  )
    .bind(accountId)
    .first<{ tracking_opt_in: number; is_owner: number }>();

  return c.json({
    displayName: profile.display_name ?? "Spotify User",
    trackingOptIn: user?.tracking_opt_in === 1,
    isOwner: user?.is_owner === 1,
  });
});

app.post("/api/tracking", async (c) => {
  const accountId = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!accountId) {
    return c.json({ error: "Not signed in." }, 401);
  }

  const { optIn } = await c.req.json<{ optIn: boolean }>();

  await c.env.DB.prepare("UPDATE users SET tracking_opt_in = ? WHERE spotify_account_id = ?")
    .bind(optIn ? 1 : 0, accountId)
    .run();

  return c.json({ trackingOptIn: optIn });
});

async function requireOwner(c: Context<{ Bindings: Env }>): Promise<string | Response> {
  const accountId = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!accountId) {
    return c.json({ error: "Not signed in." }, 401);
  }

  const user = await c.env.DB.prepare(
    "SELECT is_owner FROM users WHERE spotify_account_id = ?",
  )
    .bind(accountId)
    .first<{ is_owner: number }>();

  if (user?.is_owner !== 1) {
    return c.json({ error: "Only the app owner can manage invites." }, 403);
  }

  return accountId;
}

app.post("/api/invites", async (c) => {
  const ownerOrError = await requireOwner(c);
  if (ownerOrError instanceof Response) return ownerOrError;

  await c.env.DB.prepare("INSERT INTO invites DEFAULT VALUES").run();

  return c.json({ ok: true });
});

app.get("/api/invites", async (c) => {
  const ownerOrError = await requireOwner(c);
  if (ownerOrError instanceof Response) return ownerOrError;

  const pending = await c.env.DB.prepare(
    "SELECT count(*) AS n FROM invites WHERE used_by IS NULL",
  ).first<{ n: number }>();

  const used = await c.env.DB.prepare(
    `SELECT users.display_name AS displayName
     FROM invites
     JOIN users ON users.spotify_account_id = invites.used_by
     WHERE invites.used_by IS NOT NULL
     ORDER BY invites.used_at ASC`,
  ).all<{ displayName: string }>();

  return c.json({ pending: pending?.n ?? 0, used: used.results });
});

app.post("/api/snapshot/run", async (c) => {
  const accountId = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!accountId) {
    return c.json({ error: "Not signed in." }, 401);
  }

  const accessToken = await getFreshAccessToken(c.env, accountId);
  if (!accessToken) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Your Spotify session expired. Please sign in again." }, 401);
  }

  const snapshots = await captureSnapshot(c.env, accountId, accessToken);
  return c.json({ snapshots });
});

app.get("/api/top", async (c) => {
  const accountId = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!accountId) {
    return c.json({ error: "Not signed in." }, 401);
  }

  const type = c.req.query("type");
  if (type !== "tracks" && type !== "artists") {
    return c.json({ error: "type must be 'tracks' or 'artists'." }, 400);
  }

  const timeRange = c.req.query("time_range") ?? "medium_term";
  if (!TOP_TIME_RANGES.includes(timeRange as (typeof TOP_TIME_RANGES)[number])) {
    return c.json(
      { error: `time_range must be one of: ${TOP_TIME_RANGES.join(", ")}.` },
      400,
    );
  }

  const accessToken = await getFreshAccessToken(c.env, accountId);
  if (!accessToken) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Your Spotify session expired. Please sign in again." }, 401);
  }

  const url = new URL(`https://api.spotify.com/v1/me/top/${type}`);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("limit", String(TOP_LIMIT));

  const res = await fetchWithBackoff(() =>
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
  );

  if (!res.ok) {
    return c.json({ error: `Failed to fetch your top ${type}: ${await res.text()}` }, 502);
  }

  if (type === "tracks") {
    const data = await res.json<{ items: SpotifyTrack[] }>();
    return c.json({
      items: data.items.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map((a) => a.name).join(", "),
        albumImage: t.album.images[0]?.url ?? null,
        releaseYear: Number(t.album.release_date.slice(0, 4)),
      })),
    });
  }

  const data = await res.json<{ items: SpotifyArtist[] }>();
  return c.json({
    items: data.items.map((a) => ({
      id: a.id,
      name: a.name,
      image: a.images[0]?.url ?? null,
    })),
  });
});

app.get("/api/history", async (c) => {
  const accountId = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!accountId) {
    return c.json({ error: "Not signed in." }, 401);
  }

  const type = c.req.query("type");
  if (type !== "tracks" && type !== "artists") {
    return c.json({ error: "type must be 'tracks' or 'artists'." }, 400);
  }

  const timeRange = c.req.query("time_range") ?? "medium_term";
  if (!TOP_TIME_RANGES.includes(timeRange as (typeof TOP_TIME_RANGES)[number])) {
    return c.json(
      { error: `time_range must be one of: ${TOP_TIME_RANGES.join(", ")}.` },
      400,
    );
  }

  const itemType = type === "tracks" ? "track" : "artist";

  const snapshot = await c.env.DB.prepare(
    "SELECT id, captured_at FROM snapshots WHERE user_id = ? AND time_range = ? ORDER BY captured_at DESC LIMIT 1",
  )
    .bind(accountId, timeRange)
    .first<{ id: number; captured_at: string }>();

  if (!snapshot) {
    return c.json({ capturedAt: null, items: [] });
  }

  const itemRows = await c.env.DB.prepare(
    "SELECT rank, spotify_id FROM snapshot_items WHERE snapshot_id = ? AND item_type = ? ORDER BY rank",
  )
    .bind(snapshot.id, itemType)
    .all<{ rank: number; spotify_id: string }>();

  const accessToken = await getFreshAccessToken(c.env, accountId);
  if (!accessToken) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Your Spotify session expired. Please sign in again." }, 401);
  }

  const endpoint = type === "tracks" ? "tracks" : "artists";
  const items = await Promise.all(
    itemRows.results.map(async (row) => {
      const res = await fetchWithBackoff(() =>
        fetch(`https://api.spotify.com/v1/${endpoint}/${row.spotify_id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      if (!res.ok) {
        return { rank: row.rank, id: row.spotify_id, name: null };
      }

      if (type === "tracks") {
        const track = await res.json<SpotifyTrack>();
        return {
          rank: row.rank,
          id: track.id,
          name: track.name,
          artists: track.artists.map((a) => a.name).join(", "),
          albumImage: track.album.images[0]?.url ?? null,
        };
      }

      const artist = await res.json<SpotifyArtist>();
      return {
        rank: row.rank,
        id: artist.id,
        name: artist.name,
        image: artist.images[0]?.url ?? null,
      };
    }),
  );

  return c.json({ capturedAt: snapshot.captured_at, items });
});

const TREND_SNAPSHOT_LIMIT = 14;

app.get("/api/trend", async (c) => {
  const accountId = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!accountId) {
    return c.json({ error: "Not signed in." }, 401);
  }

  const type = c.req.query("type");
  if (type !== "tracks" && type !== "artists") {
    return c.json({ error: "type must be 'tracks' or 'artists'." }, 400);
  }

  const timeRange = c.req.query("time_range") ?? "medium_term";
  if (!TOP_TIME_RANGES.includes(timeRange as (typeof TOP_TIME_RANGES)[number])) {
    return c.json(
      { error: `time_range must be one of: ${TOP_TIME_RANGES.join(", ")}.` },
      400,
    );
  }

  const itemType = type === "tracks" ? "track" : "artist";

  const snapshots = await c.env.DB.prepare(
    "SELECT id, captured_at FROM snapshots WHERE user_id = ? AND time_range = ? ORDER BY captured_at DESC LIMIT ?",
  )
    .bind(accountId, timeRange, TREND_SNAPSHOT_LIMIT)
    .all<{ id: number; captured_at: string }>();

  if (snapshots.results.length === 0) {
    return c.json({ snapshots: [] });
  }

  const snapshotIds = snapshots.results.map((s) => s.id);
  const placeholders = snapshotIds.map(() => "?").join(",");
  const items = await c.env.DB.prepare(
    `SELECT snapshot_id, rank, spotify_id FROM snapshot_items
     WHERE snapshot_id IN (${placeholders}) AND item_type = ?
     ORDER BY rank`,
  )
    .bind(...snapshotIds, itemType)
    .all<{ snapshot_id: number; rank: number; spotify_id: string }>();

  const itemsBySnapshot = new Map<number, { id: string; rank: number }[]>();
  for (const row of items.results) {
    const list = itemsBySnapshot.get(row.snapshot_id) ?? [];
    list.push({ id: row.spotify_id, rank: row.rank });
    itemsBySnapshot.set(row.snapshot_id, list);
  }

  const result = [...snapshots.results].reverse().map((s) => ({
    capturedAt: s.captured_at,
    items: itemsBySnapshot.get(s.id) ?? [],
  }));

  return c.json({ snapshots: result });
});

app.post("/api/auth/logout", async (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await runScheduledSnapshots(env);
        await pruneOldSnapshots(env);
      })(),
    );
  },
};
