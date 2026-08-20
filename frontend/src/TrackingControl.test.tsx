import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackingControl } from "./TrackingControl";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

describe("TrackingControl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the checkbox reflecting the current opt-in state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ displayName: "Jane", trackingOptIn: true }),
      ),
    );

    render(<TrackingControl />);

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("toggles opt-in and posts the new value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ displayName: "Jane", trackingOptIn: false }))
      .mockResolvedValueOnce(jsonResponse({ trackingOptIn: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TrackingControl />);

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: true }),
      }),
    );
  });

  it("captures a snapshot on demand and shows a status message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ displayName: "Jane", trackingOptIn: true }))
      .mockResolvedValueOnce(jsonResponse({ snapshots: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TrackingControl />);

    const button = await screen.findByRole("button", { name: /capture snapshot now/i });
    fireEvent.click(button);

    expect(await screen.findByText(/snapshot captured/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/snapshot/run", { method: "POST" });
  });

  it("renders nothing when not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Not signed in." }, 401)),
    );

    const { container } = render(<TrackingControl />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
