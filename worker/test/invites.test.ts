import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { sessionCookieFor } from "./helpers";

async function makeOwner(accountId: string) {
  await env.DB.prepare("UPDATE users SET is_owner = 1 WHERE spotify_account_id = ?")
    .bind(accountId)
    .run();
}

describe("POST /api/invites", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when there is no session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/invites", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-owner user", async () => {
    const sessionCookie = await sessionCookieFor("non-owner-account", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/invites", {
        method: "POST",
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(403);
  });

  it("creates an unused invite for the owner", async () => {
    const sessionCookie = await sessionCookieFor("owner-account-create", "seed-refresh-token");
    await makeOwner("owner-account-create");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/invites", {
        method: "POST",
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM invites WHERE used_by IS NULL",
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe("GET /api/invites", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 403 for a non-owner user", async () => {
    const sessionCookie = await sessionCookieFor("non-owner-account-2", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/invites", { headers: { Cookie: sessionCookie } }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(403);
  });

  it("lists pending count and used invites with the joiner's display name", async () => {
    const sessionCookie = await sessionCookieFor("owner-account-list", "seed-refresh-token");
    await makeOwner("owner-account-list");

    const pendingBefore = await env.DB.prepare(
      "SELECT count(*) AS n FROM invites WHERE used_by IS NULL",
    ).first<{ n: number }>();

    await env.DB.prepare(
      "INSERT INTO users (spotify_account_id, display_name, refresh_token_enc) VALUES (?, ?, ?)",
    )
      .bind("joined-friend", "Friend", "irrelevant")
      .run();
    await env.DB.prepare("INSERT INTO invites DEFAULT VALUES").run();
    await env.DB.prepare(
      "INSERT INTO invites (used_by, used_at) VALUES (?, datetime('now'))",
    )
      .bind("joined-friend")
      .run();

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/invites", { headers: { Cookie: sessionCookie } }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = await res.json<{ pending: number; used: { displayName: string }[] }>();
    expect(body.pending).toBe((pendingBefore?.n ?? 0) + 1);
    expect(body.used).toContainEqual({ displayName: "Friend" });
  });
});
