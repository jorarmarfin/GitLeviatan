import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";

import { ReleaseDialog } from "./ReleaseDialog";
import type { ReleaseSuggestion } from "./types";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  const fns = Object.fromEntries(Object.keys(original.api).map((name) => [name, vi.fn()]));
  return { ...original, api: fns };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

const suggestion: ReleaseSuggestion = {
  lastTag: "v1.4.0",
  patch: "v1.4.1",
  minor: "v1.5.0",
  major: "v2.0.0",
  commitsSinceLastTag: [
    { oid: "a".repeat(40), subject: "Arregla el login" },
    { oid: "b".repeat(40), subject: "Añade tags" },
  ],
  behindUpstream: 0,
};

beforeEach(() => {
  for (const fn of Object.values(vi.mocked(api))) (fn as ReturnType<typeof vi.fn>).mockReset();
  vi.mocked(api.releaseSuggestion).mockResolvedValue(suggestion);
  vi.mocked(api.createTag).mockResolvedValue(undefined);
  vi.mocked(api.pushTag).mockResolvedValue(undefined);
});

function renderDialog(remote: string | null = "origin") {
  const onChanged = vi.fn();
  const onPublished = vi.fn();
  const onClose = vi.fn();
  render(
    <ReleaseDialog
      repository={repository}
      remote={remote}
      onChanged={onChanged}
      onPublished={onPublished}
      onClose={onClose}
    />,
  );
  return { onChanged, onPublished, onClose };
}

describe("ReleaseDialog", () => {
  it("sugiere parche, menor y mayor, y lista los commits incluidos", async () => {
    renderDialog();
    expect(await screen.findByLabelText(/Parche: v1.4.1/)).toBeChecked();
    expect(screen.getByLabelText(/Menor: v1.5.0/)).not.toBeChecked();
    expect(screen.getByLabelText(/Mayor: v2.0.0/)).not.toBeChecked();
    expect(screen.getByText(/último tag: v1.4.0/)).toBeInTheDocument();
    expect(screen.getByText("Arregla el login")).toBeInTheDocument();
    expect(screen.getByText("Añade tags")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Commits desde v1.4.0 \(2\)/ })).toBeInTheDocument();
  });

  it("crea el tag anotado y lo sube al remoto", async () => {
    const { onChanged, onPublished } = renderDialog();
    await userEvent.click(await screen.findByLabelText(/Menor: v1.5.0/));
    await userEvent.type(screen.getByLabelText("Mensaje del tag"), "Versión 1.5");
    await userEvent.click(screen.getByRole("button", { name: "Crear release" }));
    expect(api.createTag).toHaveBeenCalledWith("repo-1", "v1.5.0", null, "Versión 1.5");
    await waitFor(() => expect(api.pushTag).toHaveBeenCalledWith("repo-1", "origin", "v1.5.0"));
    expect(await screen.findByRole("status")).toHaveTextContent("creada y subida a «origin»");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onPublished).toHaveBeenCalledTimes(1);
  });

  it("sin mensaje usa «Release <versión>»", async () => {
    renderDialog();
    await screen.findByLabelText(/Parche/);
    await userEvent.click(screen.getByRole("button", { name: "Crear release" }));
    expect(api.createTag).toHaveBeenCalledWith("repo-1", "v1.4.1", null, "Release v1.4.1");
  });

  it("puede crearse sin subir", async () => {
    renderDialog();
    await userEvent.click(await screen.findByLabelText(/Subir el tag a «origin»/));
    await userEvent.click(screen.getByRole("button", { name: "Crear release" }));
    expect(await screen.findByRole("status")).toHaveTextContent("creada en local");
    expect(api.pushTag).not.toHaveBeenCalled();
  });

  it("sin remoto no ofrece subir", async () => {
    renderDialog(null);
    expect(await screen.findByLabelText(/Sin remoto/)).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Crear release" }));
    expect(await screen.findByRole("status")).toHaveTextContent("creada en local");
    expect(api.pushTag).not.toHaveBeenCalled();
  });

  it("avisa si la rama va por detrás de su upstream", async () => {
    vi.mocked(api.releaseSuggestion).mockResolvedValue({ ...suggestion, behindUpstream: 3 });
    renderDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("3 commits por detrás");
  });

  it("sin tags de versión previos pide escribir el nombre", async () => {
    vi.mocked(api.releaseSuggestion).mockResolvedValue({
      lastTag: null,
      patch: null,
      minor: null,
      major: null,
      commitsSinceLastTag: [],
      behindUpstream: 0,
    });
    renderDialog();
    expect(await screen.findByText(/No hay un tag de versión previo/)).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Crear release" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Nombre del tag"), "v0.1.0");
    expect(create).toBeEnabled();
    await userEvent.click(create);
    expect(api.createTag).toHaveBeenCalledWith("repo-1", "v0.1.0", null, "Release v0.1.0");
  });

  it("si el tag no se puede crear muestra el motivo y deja corregir", async () => {
    vi.mocked(api.createTag).mockRejectedValue({
      kind: "validation",
      message: "Ya existe un tag llamado «v1.4.1».",
      detail: null,
    });
    const { onChanged } = renderDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Crear release" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un tag");
    expect(screen.getByRole("button", { name: "Crear release" })).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(api.pushTag).not.toHaveBeenCalled();
  });

  it("si falla la subida el tag queda en local y se puede reintentar", async () => {
    vi.mocked(api.pushTag).mockRejectedValueOnce({
      kind: "network",
      message: "Sin conexión con el remoto.",
      detail: "fatal: unable to access",
    });
    const { onChanged, onPublished } = renderDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Crear release" }));
    expect(await screen.findByText(/se creó en local, pero no se pudo subir/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("fatal: unable to access");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onPublished).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar subida" }));
    expect(await screen.findByText(/creada y subida/)).toBeInTheDocument();
    expect(api.createTag).toHaveBeenCalledTimes(1);
    expect(api.pushTag).toHaveBeenCalledTimes(2);
    expect(onPublished).toHaveBeenCalledTimes(1);
  });

  it("Escape cierra sin crear nada", async () => {
    const { onClose } = renderDialog();
    await screen.findByLabelText(/Parche/);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(api.createTag).not.toHaveBeenCalled();
  });
});
