import { env } from "cloudflare:workers";
import { createScheduledController, waitOnExecutionContext, createExecutionContext } from "cloudflare:test";
import { describe, it } from "vitest";
import worker from "../src/index";

describe("scheduled export", () => {
  it("runs without throwing when there are no opted-in users", async () => {
    const controller = createScheduledController();
    const ctx = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);
  });
});
