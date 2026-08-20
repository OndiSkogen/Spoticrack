import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { sessionCookieFor } from "./helpers";

function mockTopFetch(itemsByUrl: Record<string, unknown>) {
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
      for (const [prefix, body] of Object.entries(itemsByUrl)) {
        if (url.startsWith(prefix)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
}

describe("GET /api/top", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when there is no session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/top?type=tracks"),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
  });

  it("rejects an invalid type", async () => {
    const sessionCookie = await sessionCookieFor("top-account-id", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/top?type=albums", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(400);
  });

  it("rejects an invalid time_range", async () => {
    const sessionCookie = await sessionCookieFor("top-account-id-2", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/top?type=tracks&time_range=decade", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(400);
  });

  it("returns trimmed track items for type=tracks", async () => {
    const sessionCookie = await sessionCookieFor("top-tracks-account", "seed-refresh-token");

    mockTopFetch({
      "https://api.spotify.com/v1/me/top/tracks": {
        items: [
          {
            id: "track1",
            name: "Song One",
            artists: [{ name: "Artist A" }, { name: "Artist B" }],
            album: { images: [{ url: "https://img/large.jpg" }] },
          },
        ],
      },
    });

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/top?type=tracks&time_range=short_term", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: "track1",
          name: "Song One",
          artists: "Artist A, Artist B",
          albumImage: "https://img/large.jpg",
        },
      ],
    });
  });

  it("returns trimmed artist items (including genres) for type=artists", async () => {
    const sessionCookie = await sessionCookieFor("top-artists-account", "seed-refresh-token");

    mockTopFetch({
      "https://api.spotify.com/v1/me/top/artists": {
        items: [
          {
            id: "artist1",
            name: "Band X",
            genres: ["indie rock", "shoegaze"],
            images: [{ url: "https://img/artist.jpg" }],
          },
        ],
      },
    });

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/top?type=artists", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: "artist1",
          name: "Band X",
          genres: ["indie rock", "shoegaze"],
          image: "https://img/artist.jpg",
        },
      ],
    });
  });

  it("returns 401 and clears the session when the access token can't be refreshed", async () => {
    const sessionCookie = await sessionCookieFor("expired-top-account", "seed-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid_grant", { status: 400 })),
    );

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/top?type=tracks", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toContain("spoticrack_session=;");
  });
});
