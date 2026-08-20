import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

async function login(): Promise<{ pkceCookie: string; state: string }> {
  const request = new Request("http://example.com/api/auth/login");
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);

  const setCookie = res.headers.get("Set-Cookie")!;
  const pkceCookie = setCookie.split(";")[0];
  const location = new URL(res.headers.get("Location")!);
  const state = location.searchParams.get("state")!;

  return { pkceCookie, state };
}

function mockSpotify(profile: { account_id: string; display_name: string | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://accounts.spotify.com/api/token") {
        return new Response(
          JSON.stringify({
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "https://api.spotify.com/v1/me") {
        return new Response(JSON.stringify(profile), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
}

describe("GET /api/auth/callback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bootstraps the first-ever login as the owner and sets a session", async () => {
    const { pkceCookie, state } = await login();
    mockSpotify({ account_id: "owner-account-id", display_name: "Owner" });

    const request = new Request(
      `http://example.com/api/auth/callback?code=abc123&state=${state}`,
      { headers: { Cookie: pkceCookie } },
    );
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.get("Set-Cookie")).toContain("spoticrack_session=");

    const row = await env.DB.prepare(
      "SELECT display_name, refresh_token_enc FROM users WHERE spotify_account_id = ?",
    )
      .bind("owner-account-id")
      .first<{ display_name: string; refresh_token_enc: string }>();

    expect(row?.display_name).toBe("Owner");
    expect(row?.refresh_token_enc).not.toBe("mock-refresh-token");

    const isOwner = await env.DB.prepare(
      "SELECT is_owner FROM users WHERE spotify_account_id = ?",
    )
      .bind("owner-account-id")
      .first<{ is_owner: number }>();
    expect(isOwner?.is_owner).toBe(1);
  });

  it("rejects a login from an account that isn't the owner, isn't allowlisted, and has no invite", async () => {
    // Seed an existing owner so the table is non-empty.
    await env.DB.prepare(
      "INSERT INTO users (spotify_account_id, display_name, refresh_token_enc) VALUES (?, ?, ?)",
    )
      .bind("existing-owner-id", "Owner", "irrelevant")
      .run();

    const { pkceCookie, state } = await login();
    mockSpotify({ account_id: "stranger-account-id", display_name: "Stranger" });

    const request = new Request(
      `http://example.com/api/auth/callback?code=abc123&state=${state}`,
      { headers: { Cookie: pkceCookie } },
    );
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(403);
    expect(res.headers.get("Set-Cookie") ?? "").not.toContain("spoticrack_session=");

    const row = await env.DB.prepare(
      "SELECT 1 FROM users WHERE spotify_account_id = ?",
    )
      .bind("stranger-account-id")
      .first();
    expect(row).toBeNull();
  });

  it("admits an unrecognized login when an unused invite exists, and consumes it", async () => {
    await env.DB.prepare(
      "INSERT INTO users (spotify_account_id, display_name, refresh_token_enc, is_owner) VALUES (?, ?, ?, 1)",
    )
      .bind("existing-owner-id-2", "Owner", "irrelevant")
      .run();
    const invite = await env.DB.prepare("INSERT INTO invites DEFAULT VALUES").run();

    const { pkceCookie, state } = await login();
    mockSpotify({ account_id: "invited-friend-id", display_name: "Friend" });

    const request = new Request(
      `http://example.com/api/auth/callback?code=abc123&state=${state}`,
      { headers: { Cookie: pkceCookie } },
    );
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toContain("spoticrack_session=");

    const row = await env.DB.prepare(
      "SELECT is_owner FROM users WHERE spotify_account_id = ?",
    )
      .bind("invited-friend-id")
      .first<{ is_owner: number }>();
    expect(row?.is_owner).toBe(0);

    const usedInvite = await env.DB.prepare("SELECT used_by, used_at FROM invites WHERE id = ?")
      .bind(invite.meta.last_row_id)
      .first<{ used_by: string; used_at: string }>();
    expect(usedInvite?.used_by).toBe("invited-friend-id");
    expect(usedInvite?.used_at).toBeTruthy();
  });

  it("rejects a callback whose state doesn't match the login's state", async () => {
    const { pkceCookie } = await login();

    const request = new Request(
      "http://example.com/api/auth/callback?code=abc123&state=wrong-state",
      { headers: { Cookie: pkceCookie } },
    );
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(400);
  });

  it("rejects a callback with no pkce cookie at all", async () => {
    const request = new Request(
      "http://example.com/api/auth/callback?code=abc123&state=whatever",
    );
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(400);
  });
});
