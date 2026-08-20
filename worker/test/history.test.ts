import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { sessionCookieFor } from "./helpers";

async function seedSnapshot(
  accountId: string,
  timeRange: string,
  items: { itemType: "track" | "artist"; rank: number; spotifyId: string }[],
) {
  const inserted = await env.DB.prepare(
    "INSERT INTO snapshots (user_id, time_range) VALUES (?, ?)",
  )
    .bind(accountId, timeRange)
    .run();
  const snapshotId = inserted.meta.last_row_id;

  for (const item of items) {
    await env.DB.prepare(
      "INSERT INTO snapshot_items (snapshot_id, item_type, rank, spotify_id) VALUES (?, ?, ?, ?)",
    )
      .bind(snapshotId, item.itemType, item.rank, item.spotifyId)
      .run();
  }
}

describe("GET /api/history", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when there is no session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/history?type=tracks"),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
  });

  it("returns empty items when there's no snapshot yet", async () => {
    const sessionCookie = await sessionCookieFor("no-history-account", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/history?type=tracks&time_range=medium_term", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ capturedAt: null, items: [] });
  });

  it("re-hydrates stored track IDs into names/images, preserving rank order", async () => {
    const sessionCookie = await sessionCookieFor("history-tracks-account", "seed-refresh-token");
    await seedSnapshot("history-tracks-account", "medium_term", [
      { itemType: "track", rank: 1, spotifyId: "track-1" },
      { itemType: "track", rank: 2, spotifyId: "track-2" },
    ]);

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
        if (url === "https://api.spotify.com/v1/tracks/track-1") {
          return new Response(
            JSON.stringify({
              id: "track-1",
              name: "Song One",
              artists: [{ name: "Artist A" }],
              album: { images: [{ url: "https://img/1.jpg" }] },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url === "https://api.spotify.com/v1/tracks/track-2") {
          return new Response(
            JSON.stringify({
              id: "track-2",
              name: "Song Two",
              artists: [{ name: "Artist B" }],
              album: { images: [{ url: "https://img/2.jpg" }] },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/history?type=tracks&time_range=medium_term", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = await res.json<{ capturedAt: string; items: unknown[] }>();
    expect(body.capturedAt).toBeTruthy();
    expect(body.items).toEqual([
      { rank: 1, id: "track-1", name: "Song One", artists: "Artist A", albumImage: "https://img/1.jpg" },
      { rank: 2, id: "track-2", name: "Song Two", artists: "Artist B", albumImage: "https://img/2.jpg" },
    ]);
  });
});
