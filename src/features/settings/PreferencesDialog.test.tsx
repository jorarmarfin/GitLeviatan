import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";
import { DEFAULT_SETTINGS, useSettingsStore } from "@/stores/settings";

import { GitMissingScreen } from "./GitMissingScreen";
import { PreferencesDialog } from "./PreferencesDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      updateSettings: vi.fn(),
      detectGit: vi.fn(),
      clearRecentRepositories: vi.fn(),
      listRecentRepositories: vi.fn(),
    },
  };
});

const recent = { path: "/tmp/a", name: "a", lastOpenedAt: "2026-10-19T00:00:00Z" };

beforeEach(() => {
  useSettingsStore.setState({
    settings: DEFAULT_SETTINGS,
    git: { available: true, version: "2.43.0", message: null },
  });
  useRepositoryStore.setState({ recents: [recent] });
  vi.mocked(api.updateSettings)
    .mockReset()
    .mockImplementation(async (settings) => settings);
  vi.mocked(api.detectGit)
    .mockReset()
    .mockResolvedValue({ available: true, version: "2.43.0", message: null });
  vi.mocked(api.clearRecentRepositories).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.listRecentRepositories).mockReset().mockResolvedValue([]);
});

describe("PreferencesDialog", () => {
  it("muestra la versión de Git detectada", () => {
    render(<PreferencesDialog onClose={vi.fn()} />);
    expect(screen.getByText(/Git 2\.43\.0 detectado/)).toBeInTheDocument();
  });

  it("guarda ruta de Git y límite de recientes", async () => {
    const user = userEvent.setup();
    render(<PreferencesDialog onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Ejecutable de Git"), "/opt/git/bin/git");
    const max = screen.getByLabelText(/recientes a conservar/i);
    await user.clear(max);
    await user.type(max, "8");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({
        ...DEFAULT_SETTINGS,
        gitPath: "/opt/git/bin/git",
        maxRecentRepositories: 8,
      }),
    );
    expect(await screen.findByText("Preferencias guardadas.")).toBeInTheDocument();
  });

  it("muestra el rechazo de una ruta inválida y no la da por guardada", async () => {
    vi.mocked(api.updateSettings).mockRejectedValue({
      kind: "git",
      message: "No se encontró el ejecutable de Git.",
      detail: null,
    });
    const user = userEvent.setup();
    render(<PreferencesDialog onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Ejecutable de Git"), "/falso/git");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se encontró el ejecutable");
    expect(screen.queryByText("Preferencias guardadas.")).not.toBeInTheDocument();
    expect(useSettingsStore.getState().settings.gitPath).toBeNull();
  });

  it("no permite guardar un límite fuera de 5–50", async () => {
    const user = userEvent.setup();
    render(<PreferencesDialog onClose={vi.fn()} />);
    const max = screen.getByLabelText(/recientes a conservar/i);

    for (const bad of ["4", "51", "abc"]) {
      await user.clear(max);
      await user.type(max, bad);
      expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    }
    await user.clear(max);
    await user.type(max, "5");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("limpia la lista de recientes", async () => {
    const user = userEvent.setup();
    render(<PreferencesDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Limpiar recientes" }));

    expect(api.clearRecentRepositories).toHaveBeenCalled();
    await waitFor(() => expect(useRepositoryStore.getState().recents).toEqual([]));
    expect(await screen.findByText("La lista está vacía.")).toBeInTheDocument();
  });
});

describe("GitMissingScreen", () => {
  it("explica cómo instalar Git y permite reintentar", async () => {
    const onRetry = vi.fn();
    const onOpenPreferences = vi.fn();
    const user = userEvent.setup();
    render(
      <GitMissingScreen
        message="No se encontró el ejecutable de Git."
        onRetry={onRetry}
        onOpenPreferences={onOpenPreferences}
      />,
    );

    expect(screen.getByRole("heading", { name: "No se encontró Git" })).toBeInTheDocument();
    expect(screen.getByText(/apt install git/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await user.click(screen.getByRole("button", { name: "Abrir preferencias" }));
    expect(onRetry).toHaveBeenCalled();
    expect(onOpenPreferences).toHaveBeenCalled();
  });
});
