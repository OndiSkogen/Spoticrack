import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encrypt, importEncryptionKey } from "../src/crypto";
import worker from "../src/index";

async function seedUser(accountId: string, refreshToken: string) {
  const key = await importEncryptionKey(env.REFRESH_TOKEN_ENCRYPTION_KEY);
  const encrypted = await encrypt(refreshToken, key);
  await env.DB.prepare(
    "INSERT INTO users (spotify_account_id, display_name, refresh_token_enc) VALUES (?, ?, ?)",
  )
    .bind(accountId, "Existing User", encrypted)
    .run();
}

async function sessionCookieFor(accountId: string, refreshToken: string): Promise<string> {
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
        return new Response(JSON.stringify({ account_id: accountId, display_name: "Existing User" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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

describe("GET /api/me", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when there is no session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/me"),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
  });

  it("returns the display name for a signed-in user, refreshing the access token", async () => {
    const sessionCookie = await sessionCookieFor("me-account-id", "seed-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://accounts.spotify.com/api/token") {
          return new Response(JSON.stringify({ access_token: "fresh-access-token" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url === "https://api.spotify.com/v1/me") {
          return new Response(
            JSON.stringify({ account_id: "me-account-id", display_name: "Existing User" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/me", { headers: { Cookie: sessionCookie } }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ displayName: "Existing User" });
  });

  it("returns 401 and clears the session when the refresh token is no longer valid", async () => {
    const sessionCookie = await sessionCookieFor("revoked-account-id", "seed-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid_grant", { status: 400 })),
    );

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/me", { headers: { Cookie: sessionCookie } }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toContain("spoticrack_session=;");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/auth/logout", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("spoticrack_session=;");
  });
});
