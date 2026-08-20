import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteManager } from "./InviteManager";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => body };
}

describe("InviteManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for a non-owner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ displayName: "Jane", isOwner: false })),
    );

    const { container } = render(<InviteManager />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Not signed in." }, 401)),
    );

    const { container } = render(<InviteManager />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows pending count and used invites for the owner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/me") return jsonResponse({ displayName: "Jane", isOwner: true });
        if (url === "/api/invites")
          return jsonResponse({ pending: 2, used: [{ displayName: "Friend One" }] });
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );

    render(<InviteManager />);

    expect(await screen.findByText(/2 pending/i)).toBeInTheDocument();
    expect(screen.getByText(/friend one/i)).toBeInTheDocument();
  });

  it("creates an invite and refreshes the pending count", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/me") return jsonResponse({ displayName: "Jane", isOwner: true });
      if (url === "/api/invites" && init?.method === "POST") return jsonResponse({ ok: true });
      if (url === "/api/invites") return jsonResponse({ pending: 0, used: [] });
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InviteManager />);

    const button = await screen.findByRole("button", { name: /invite a friend/i });
    fireEvent.click(button);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/invites", { method: "POST" }),
    );
  });
});
