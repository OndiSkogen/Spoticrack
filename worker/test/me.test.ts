import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { sessionCookieFor } from "./helpers";

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
    await expect(res.json()).resolves.toEqual({
      displayName: "Existing User",
      trackingOptIn: false,
      isOwner: false,
    });
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
