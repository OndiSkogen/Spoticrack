import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("CORS on /api/*", () => {
  it("allows a request from an allowlisted origin", async () => {
    const request = new Request("http://example.com/api/health", {
      headers: { Origin: "http://localhost:5173" },
    });
    const ctx = createExecutionContext();

    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
  });

  it("does not reflect an origin that isn't allowlisted", async () => {
    const request = new Request("http://example.com/api/health", {
      headers: { Origin: "https://evil.example.com" },
    });
    const ctx = createExecutionContext();

    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
