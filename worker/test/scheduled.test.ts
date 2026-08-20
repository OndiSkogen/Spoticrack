import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encrypt, importEncryptionKey } from "../src/crypto";
import { pruneOldSnapshots, runScheduledSnapshots } from "../src/scheduled";

async function seedUser(accountId: string, refreshToken: string, trackingOptIn: boolean) {
  const key = await importEncryptionKey(env.REFRESH_TOKEN_ENCRYPTION_KEY);
  const encrypted = await encrypt(refreshToken, key);
  await env.DB.prepare(
    "INSERT INTO users (spotify_account_id, display_name, refresh_token_enc, tracking_opt_in) VALUES (?, ?, ?, ?)",
  )
    .bind(accountId, "Test User", encrypted, trackingOptIn ? 1 : 0)
    .run();
}

function mockSpotifyForScheduled(goodRefreshToken: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://accounts.spotify.com/api/token") {
        const body = String(init?.body ?? "");
        if (!body.includes(goodRefreshToken)) {
          return new Response("invalid_grant", { status: 400 });
        }
        return new Response(JSON.stringify({ access_token: "fresh-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.startsWith("https://api.spotify.com/v1/me/top/")) {
        return new Response(JSON.stringify({ items: [{ id: "item-1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
}

describe("runScheduledSnapshots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips users who haven't opted in", async () => {
    await seedUser("opted-out-account", "some-token", false);
    mockSpotifyForScheduled("irrelevant");

    await runScheduledSnapshots(env);

    const count = await env.DB.prepare("SELECT count(*) AS n FROM snapshots WHERE user_id = ?")
      .bind("opted-out-account")
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("captures snapshots for opted-in users and isolates one user's failure from the rest", async () => {
    await seedUser("good-account", "good-refresh-token", true);
    await seedUser("bad-account", "bad-refresh-token", true);
    mockSpotifyForScheduled("good-refresh-token");

    await runScheduledSnapshots(env);

    const goodCount = await env.DB.prepare(
      "SELECT count(*) AS n FROM snapshots WHERE user_id = ?",
    )
      .bind("good-account")
      .first<{ n: number }>();
    const badCount = await env.DB.prepare("SELECT count(*) AS n FROM snapshots WHERE user_id = ?")
      .bind("bad-account")
      .first<{ n: number }>();

    expect(goodCount?.n).toBe(3); // one per time range
    expect(badCount?.n).toBe(0); // failed to refresh, skipped - not a partial/broken row
  });
});

describe("pruneOldSnapshots", () => {
  it("deletes snapshots (and their items) older than the retention window, keeps recent ones", async () => {
    await seedUser("prune-account", "some-token", false);

    const old = await env.DB.prepare(
      "INSERT INTO snapshots (user_id, time_range, captured_at) VALUES (?, ?, ?)",
    )
      .bind("prune-account", "medium_term", "2020-01-01 00:00:00")
      .run();
    const recent = await env.DB.prepare(
      "INSERT INTO snapshots (user_id, time_range) VALUES (?, ?)",
    )
      .bind("prune-account", "medium_term")
      .run();

    await env.DB.prepare(
      "INSERT INTO snapshot_items (snapshot_id, item_type, rank, spotify_id) VALUES (?, 'track', 1, 'x')",
    )
      .bind(old.meta.last_row_id)
      .run();
    await env.DB.prepare(
      "INSERT INTO snapshot_items (snapshot_id, item_type, rank, spotify_id) VALUES (?, 'track', 1, 'y')",
    )
      .bind(recent.meta.last_row_id)
      .run();

    await pruneOldSnapshots(env);

    const remainingSnapshots = await env.DB.prepare(
      "SELECT id FROM snapshots WHERE user_id = ?",
    )
      .bind("prune-account")
      .all<{ id: number }>();
    expect(remainingSnapshots.results.map((r) => r.id)).toEqual([recent.meta.last_row_id]);

    const remainingItems = await env.DB.prepare(
      "SELECT snapshot_id FROM snapshot_items WHERE snapshot_id = ?",
    )
      .bind(old.meta.last_row_id)
      .all();
    expect(remainingItems.results).toHaveLength(0);
  });
});
