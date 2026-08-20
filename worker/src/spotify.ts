import { decrypt, encrypt, importEncryptionKey } from "./crypto";

export type SpotifyEnv = {
  DB: D1Database;
  SPOTIFY_CLIENT_ID: string;
  REFRESH_TOKEN_ENCRYPTION_KEY: string;
};

/**
 * Retries a request on HTTP 429, honoring the Retry-After header (seconds).
 * Returns the last response either way - callers still need to check status.
 */
export async function fetchWithBackoff(
  doFetch: () => Promise<Response>,
  maxRetries = 3,
): Promise<Response> {
  let attempt = 0;

  while (true) {
    const res = await doFetch();
    if (res.status !== 429 || attempt >= maxRetries) return res;

    const retryAfterSeconds = Number(res.headers.get("Retry-After")) || 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
    attempt++;
  }
}

type RefreshTokenResponse = {
  access_token: string;
  refresh_token?: string;
};

/**
 * Looks up the user's encrypted refresh token, exchanges it for a fresh
 * access token, and re-encrypts + stores a rotated refresh token if Spotify
 * issued one. Returns null (rather than throwing) on any failure - an
 * unknown account, or Spotify rejecting the refresh token - so callers can
 * decide how to respond (401, clear session, etc).
 */
export async function getFreshAccessToken(
  env: SpotifyEnv,
  accountId: string,
): Promise<string | null> {
  const user = await env.DB.prepare(
    "SELECT refresh_token_enc FROM users WHERE spotify_account_id = ?",
  )
    .bind(accountId)
    .first<{ refresh_token_enc: string }>();

  if (!user) return null;

  const encryptionKey = await importEncryptionKey(env.REFRESH_TOKEN_ENCRYPTION_KEY);
  const refreshToken = await decrypt(user.refresh_token_enc, encryptionKey);

  const tokenRes = await fetchWithBackoff(() =>
    fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env.SPOTIFY_CLIENT_ID,
      }),
    }),
  );

  if (!tokenRes.ok) return null;

  const tokens = await tokenRes.json<RefreshTokenResponse>();

  if (tokens.refresh_token) {
    const reEncrypted = await encrypt(tokens.refresh_token, encryptionKey);
    await env.DB.prepare("UPDATE users SET refresh_token_enc = ? WHERE spotify_account_id = ?")
      .bind(reEncrypted, accountId)
      .run();
  }

  return tokens.access_token;
}
