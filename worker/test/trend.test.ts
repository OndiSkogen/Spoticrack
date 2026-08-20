import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { sessionCookieFor } from "./helpers";

async function seedSnapshot(
  accountId: string,
  timeRange: string,
  capturedAt: string,
  items: { itemType: "track" | "artist"; rank: number; spotifyId: string }[],
) {
  const inserted = await env.DB.prepare(
    "INSERT INTO snapshots (user_id, time_range, captured_at) VALUES (?, ?, ?)",
  )
    .bind(accountId, timeRange, capturedAt)
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

describe("GET /api/trend", () => {
  it("returns 401 when there is no session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/trend?type=tracks"),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
  });

  it("returns an empty list when there's no history yet", async () => {
    const sessionCookie = await sessionCookieFor("no-trend-account", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/trend?type=tracks&time_range=medium_term", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ snapshots: [] });
  });

  it("returns snapshots in chronological order, ID + rank only, no Spotify calls", async () => {
    const sessionCookie = await sessionCookieFor("trend-account", "seed-refresh-token");

    await seedSnapshot("trend-account", "medium_term", "2026-08-18 06:00:00", [
      { itemType: "track", rank: 1, spotifyId: "track-a" },
      { itemType: "track", rank: 2, spotifyId: "track-b" },
    ]);
    await seedSnapshot("trend-account", "medium_term", "2026-08-19 06:00:00", [
      { itemType: "track", rank: 1, spotifyId: "track-b" },
      { itemType: "track", rank: 2, spotifyId: "track-a" },
    ]);
    // Different time range - should not appear in results.
    await seedSnapshot("trend-account", "short_term", "2026-08-19 06:00:00", [
      { itemType: "track", rank: 1, spotifyId: "track-c" },
    ]);

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/trend?type=tracks&time_range=medium_term", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      snapshots: [
        {
          capturedAt: "2026-08-18 06:00:00",
          items: [
            { id: "track-a", rank: 1 },
            { id: "track-b", rank: 2 },
          ],
        },
        {
          capturedAt: "2026-08-19 06:00:00",
          items: [
            { id: "track-b", rank: 1 },
            { id: "track-a", rank: 2 },
          ],
        },
      ],
    });
  });

  it("rejects an invalid type", async () => {
    const sessionCookie = await sessionCookieFor("trend-account-2", "seed-refresh-token");

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/trend?type=albums", {
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(400);
  });
});
