import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt, importEncryptionKey } from "../src/crypto";
import { fetchWithBackoff, getFreshAccessToken } from "../src/spotify";

describe("fetchWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns immediately on a non-429 response", async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    const res = await fetchWithBackoff(doFetch);

    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("retries after honoring the Retry-After header, then succeeds", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", { status: 429, headers: { "Retry-After": "2" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithBackoff(doFetch);
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the max retry count and returns the last 429 response", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(
        new Response("rate limited", { status: 429, headers: { "Retry-After": "1" } }),
      );

    const promise = fetchWithBackoff(doFetch, 2);
    await vi.advanceTimersByTimeAsync(5000);
    const res = await promise;

    expect(res.status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe("getFreshAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedUser(accountId: string, refreshToken: string) {
    const key = await importEncryptionKey(env.REFRESH_TOKEN_ENCRYPTION_KEY);
    const encrypted = await encrypt(refreshToken, key);
    await env.DB.prepare(
      "INSERT INTO users (spotify_account_id, display_name, refresh_token_enc) VALUES (?, ?, ?)",
    )
      .bind(accountId, "Test User", encrypted)
      .run();
  }

  it("returns null when the account isn't in the users table", async () => {
    const token = await getFreshAccessToken(env, "no-such-account");
    expect(token).toBeNull();
  });

  it("returns a fresh access token and re-encrypts a rotated refresh token", async () => {
    await seedUser("rotate-account-id", "old-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "fresh-token", refresh_token: "new-refresh-token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const token = await getFreshAccessToken(env, "rotate-account-id");
    expect(token).toBe("fresh-token");

    const key = await importEncryptionKey(env.REFRESH_TOKEN_ENCRYPTION_KEY);
    const row = await env.DB.prepare(
      "SELECT refresh_token_enc FROM users WHERE spotify_account_id = ?",
    )
      .bind("rotate-account-id")
      .first<{ refresh_token_enc: string }>();
    const { decrypt } = await import("../src/crypto");
    await expect(decrypt(row!.refresh_token_enc, key)).resolves.toBe("new-refresh-token");
  });

  it("returns null when Spotify rejects the refresh token", async () => {
    await seedUser("revoked-account-id", "dead-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid_grant", { status: 400 })),
    );

    const token = await getFreshAccessToken(env, "revoked-account-id");
    expect(token).toBeNull();
  });
});
