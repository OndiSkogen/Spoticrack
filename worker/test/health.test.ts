import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("GET /api/health", () => {
  it("reports ok status and a working D1 connection", async () => {
    const request = new Request("http://example.com/api/health");
    const ctx = createExecutionContext();

    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok", db: "ok" });
  });

  it("returns 404 for unknown routes", async () => {
    const request = new Request("http://example.com/api/nope");
    const ctx = createExecutionContext();

    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(404);
  });
});
