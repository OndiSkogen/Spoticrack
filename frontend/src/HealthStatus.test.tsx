import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthStatus } from "./HealthStatus";

describe("HealthStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows API and DB status once the health check resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok", db: "ok" }),
      }),
    );

    render(<HealthStatus />);

    expect(screen.getByText("Checking…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("API: ok · DB: ok")).toBeInTheDocument(),
    );
  });

  it("shows an unreachable message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<HealthStatus />);

    await waitFor(() =>
      expect(screen.getByText(/api unreachable/i)).toBeInTheDocument(),
    );
  });
});
