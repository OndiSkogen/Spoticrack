import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getStoredTheme } from "./theme";
import { ThemeSwitcher } from "./ThemeSwitcher";

describe("ThemeSwitcher", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies the stored/default theme on mount", () => {
    render(<ThemeSwitcher />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("chart-topper");
  });

  it("renders all three theme options, with the current one pressed", () => {
    render(<ThemeSwitcher />);

    expect(screen.getByRole("button", { name: "Chart-Topper" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Studio Console" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Vinyl Liner Notes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches theme, applies it, and persists it on click", () => {
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "Studio Console" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("studio-console");
    expect(screen.getByRole("button", { name: "Studio Console" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(getStoredTheme()).toBe("studio-console");
  });
});
