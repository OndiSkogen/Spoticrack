import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { vi } from "vitest";
import { encrypt, importEncryptionKey } from "../src/crypto";
import worker from "../src/index";

export async function seedUser(accountId: string, refreshToken: string) {
  const key = await importEncryptionKey(env.REFRESH_TOKEN_ENCRYPTION_KEY);
  const encrypted = await encrypt(refreshToken, key);
  await env.DB.prepare(
    "INSERT INTO users (spotify_account_id, display_name, refresh_token_enc) VALUES (?, ?, ?)",
  )
    .bind(accountId, "Existing User", encrypted)
    .run();
}

/**
 * Seeds a user and drives them through login + callback to obtain a real
 * session cookie, using a temporary fetch mock for the Spotify calls that
 * happen along the way. Restores whatever fetch mock the caller had set
 * up before calling this (or the real fetch, if none) afterwards.
 */
export async function sessionCookieFor(accountId: string, refreshToken: string): Promise<string> {
  await seedUser(accountId, refreshToken);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://accounts.spotify.com/api/token") {
        return new Response(
          JSON.stringify({ access_token: "seed-access-token", refresh_token: refreshToken }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "https://api.spotify.com/v1/me") {
        return new Response(
          JSON.stringify({ account_id: accountId, display_name: "Existing User" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );

  const loginRes = await worker.fetch(
    new Request("http://example.com/api/auth/login"),
    env,
    createExecutionContext(),
  );
  const setCookie = loginRes.headers.get("Set-Cookie")!;
  const pkceCookie = setCookie.split(";")[0];
  const location = new URL(loginRes.headers.get("Location")!);
  const state = location.searchParams.get("state")!;

  const ctx = createExecutionContext();
  const callbackRes = await worker.fetch(
    new Request(`http://example.com/api/auth/callback?code=abc&state=${state}`, {
      headers: { Cookie: pkceCookie },
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);

  const sessionSetCookie = callbackRes.headers
    .getSetCookie()
    .find((c) => c.startsWith("spoticrack_session="))!;

  return sessionSetCookie.split(";")[0];
}
