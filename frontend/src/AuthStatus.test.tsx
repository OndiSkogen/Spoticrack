import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStatus } from "./AuthStatus";

describe("AuthStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a sign-in link when not authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    render(<AuthStatus />);

    const link = await screen.findByRole("link", { name: /sign in with spotify/i });
    expect(link).toHaveAttribute("href", "/api/auth/login");
  });

  it("shows the display name and a logout button when authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ displayName: "Jane Listener" }),
      }),
    );

    render(<AuthStatus />);

    expect(await screen.findByText(/signed in as jane listener/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("signs out and returns to the sign-in link on logout click", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ displayName: "Jane Listener" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthStatus />);

    const logoutButton = await screen.findByRole("button", { name: /sign out/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    });
    expect(
      await screen.findByRole("link", { name: /sign in with spotify/i }),
    ).toBeInTheDocument();
  });
});
