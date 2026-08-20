import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("GET /api/auth/login", () => {
  it("redirects to Spotify's authorize endpoint with correct PKCE params", async () => {
    const request = new Request("http://example.com/api/auth/login");
    const ctx = createExecutionContext();

    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);

    expect(location.origin + location.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("client_id")).toBe(env.SPOTIFY_CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://example.com/api/auth/callback",
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("scope")).toBe(
      "user-read-private user-read-email user-top-read",
    );
  });

  it("sets a short-lived signed cookie carrying the verifier and state", async () => {
    const request = new Request("http://example.com/api/auth/login");
    const ctx = createExecutionContext();

    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("spoticrack_pkce=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
  });
});
