import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { sessionCookieFor } from "./helpers";

function mockTopEndpoints() {
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

      if (url.startsWith("https://api.spotify.com/v1/me/top/tracks")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "track-a" }, { id: "track-b" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.startsWith("https://api.spotify.com/v1/me/top/artists")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "artist-a" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
}

describe("POST /api/snapshot/run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when there is no session cookie", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/snapshot/run", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(401);
  });

  it("captures one snapshot per time range, storing only id + rank", async () => {
    const sessionCookie = await sessionCookieFor("snapshot-account-id", "seed-refresh-token");
    mockTopEndpoints();

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/snapshot/run", {
        method: "POST",
        headers: { Cookie: sessionCookie },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = await res.json<{ snapshots: { timeRange: string }[] }>();
    expect(body.snapshots.map((s) => s.timeRange).sort()).toEqual([
      "long_term",
      "medium_term",
      "short_term",
    ]);

    const snapshotRows = await env.DB.prepare(
      "SELECT id, time_range FROM snapshots WHERE user_id = ?",
    )
      .bind("snapshot-account-id")
      .all<{ id: number; time_range: string }>();
    expect(snapshotRows.results).toHaveLength(3);

    const firstSnapshotId = snapshotRows.results[0].id;
    const itemRows = await env.DB.prepare(
      "SELECT item_type, rank, spotify_id FROM snapshot_items WHERE snapshot_id = ? ORDER BY item_type, rank",
    )
      .bind(firstSnapshotId)
      .all<{ item_type: string; rank: number; spotify_id: string }>();

    expect(itemRows.results).toEqual([
      { item_type: "artist", rank: 1, spotify_id: "artist-a" },
      { item_type: "track", rank: 1, spotify_id: "track-a" },
      { item_type: "track", rank: 2, spotify_id: "track-b" },
    ]);

    // Only id + rank are ever stored - no names, images, or other content.
    const columns = Object.keys(itemRows.results[0]);
    expect(columns.sort()).toEqual(["item_type", "rank", "spotify_id"]);
  });

  it("returns 401 and clears the session when the access token can't be refreshed", async () => {
    const sessionCookie = await sessionCookieFor("expired-snapshot-account", "seed-refresh-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid_grant", { status: 400 })),
    );

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://example.com/api/snapshot/run", {
        method: "POST",
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
