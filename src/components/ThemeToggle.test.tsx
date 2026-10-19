import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { applyTheme } from "@/lib/theme";
import { DEFAULT_SETTINGS, useSettingsStore } from "@/stores/settings";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, updateSettings: vi.fn() } };
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  vi.mocked(api.updateSettings)
    .mockReset()
    .mockImplementation(async (settings) => settings);
});

describe("ThemeToggle", () => {
  it("guarda el tema en las preferencias, no en localStorage", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: /oscuro/i }));

    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: "dark" }),
    );
    expect(screen.getByRole("button", { name: /oscuro/i })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.length).toBe(0);
  });

  it("refleja el tema guardado en las preferencias", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, theme: "dark" } });
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /oscuro/i })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("applyTheme", () => {
  it("alterna la clase dark", () => {
    applyTheme("dark");
    expect(document.documentElement).toHaveClass("dark");
    applyTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
