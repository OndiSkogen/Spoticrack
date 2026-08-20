import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { sessionCookieFor } from "./helpers";

describe("POST /api/tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when there is no session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: true }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
  });

  it("turns tracking on and reflects it back via /api/me", async () => {
    const sessionCookie = await sessionCookieFor("tracking-account-id", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/tracking", {
        method: "POST",
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: true }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ trackingOptIn: true });

    const row = await env.DB.prepare(
      "SELECT tracking_opt_in FROM users WHERE spotify_account_id = ?",
    )
      .bind("tracking-account-id")
      .first<{ tracking_opt_in: number }>();
    expect(row?.tracking_opt_in).toBe(1);
  });

  it("turns tracking back off", async () => {
    const sessionCookie = await sessionCookieFor("tracking-account-id-2", "seed-refresh-token");

    const ctxOn = createExecutionContext();
    await worker.fetch(
      new Request("http://example.com/api/tracking", {
        method: "POST",
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: true }),
      }),
      env,
      ctxOn,
    );
    await waitOnExecutionContext(ctxOn);

    const ctxOff = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/tracking", {
        method: "POST",
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: false }),
      }),
      env,
      ctxOff,
    );
    await waitOnExecutionContext(ctxOff);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ trackingOptIn: false });
  });
});
