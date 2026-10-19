import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import type { SyncProgress } from "@/types/git";

import { TagsPanel } from "./TagsPanel";
import type { TagInfo } from "./types";

let emit: (progress: SyncProgress) => void = () => undefined;
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, handler: (e: { payload: SyncProgress }) => void) => {
    emit = (payload) => handler({ payload });
    return () => undefined;
  }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  const fns = Object.fromEntries(Object.keys(original.api).map((name) => [name, vi.fn()]));
  return { ...original, api: fns };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };
const oid = (c: string) => c.repeat(40);

const tag = (name: string, over: Partial<TagInfo> = {}): TagInfo => ({
  name,
  kind: "annotated",
  targetOid: oid("a"),
  tagOid: oid("t"),
  message: "m",
  taggerDate: "2026-10-19T10:00:00+00:00",
  existsLocal: true,
  existsRemote: null,
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(vi.mocked(api))) (fn as ReturnType<typeof vi.fn>).mockReset();
  vi.mocked(api.listTags).mockResolvedValue([tag("v1.1.0"), tag("v1.0.0")]);
  vi.mocked(api.listBranches).mockResolvedValue([]);
  vi.mocked(api.listRemotes).mockResolvedValue([
    { name: "origin", fetchUrl: "file:///r", pushUrl: "file:///r" },
  ]);
  vi.mocked(api.listRemoteTags).mockResolvedValue([{ name: "v1.0.0", targetOid: oid("a") }]);
  vi.mocked(api.fetchTags).mockResolvedValue(undefined);
  vi.mocked(api.pushTag).mockResolvedValue(undefined);
  vi.mocked(api.deleteTag).mockResolvedValue(undefined);
  vi.mocked(api.deleteRemoteTag).mockResolvedValue(undefined);
  vi.mocked(api.cancelOperation).mockResolvedValue(true);
});

async function renderPanel() {
  const onChanged = vi.fn();
  render(
    <TagsPanel
      repository={repository}
      selectedOid={null}
      externalVersion={0}
      onChanged={onChanged}
    />,
  );
  await screen.findByRole("list", { name: "Tags del repositorio" });
  // Espera a que se conozca el remoto: habilita los botones de red.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Consultar tags del remoto" })).toBeEnabled(),
  );
  return onChanged;
}

describe("TagsPanel", () => {
  it("lista los tags locales", async () => {
    await renderPanel();
    const list = within(screen.getByRole("list", { name: "Tags del repositorio" }));
    expect(list.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("v1.1.0"),
        expect.stringContaining("v1.0.0"),
      ]),
    );
  });

  it("sin tags lo indica", async () => {
    vi.mocked(api.listTags).mockResolvedValue([]);
    await renderPanel();
    expect(screen.getByText("Sin tags.")).toBeInTheDocument();
  });

  it("consultar el remoto marca qué falta en cada lado y añade los solo remotos", async () => {
    vi.mocked(api.listRemoteTags).mockResolvedValue([
      { name: "v1.0.0", targetOid: oid("a") },
      { name: "v0.9.0", targetOid: oid("b") },
    ]);
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Consultar tags del remoto" }));
    expect(api.listRemoteTags).toHaveBeenCalledWith("repo-1", "origin");

    const list = within(screen.getByRole("list", { name: "Tags del repositorio" }));
    const item = (name: string) => list.getByText(name, { selector: "span" }).closest("li")!;
    expect(await within(item("v1.1.0")).findByText("solo local")).toBeInTheDocument();
    expect(within(item("v0.9.0")).getByText("solo remoto")).toBeInTheDocument();
    expect(within(item("v1.0.0")).queryByText(/solo/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("tiene 2 tags");
  });

  it("avisa de un tag que apunta a otro commit en el remoto", async () => {
    vi.mocked(api.listRemoteTags).mockResolvedValue([{ name: "v1.0.0", targetOid: oid("b") }]);
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Consultar tags del remoto" }));
    expect(await screen.findByText("otro commit")).toBeInTheDocument();
  });

  it("traer tags refresca la lista", async () => {
    const onChanged = await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Traer tags" }));
    expect(api.fetchTags).toHaveBeenCalledWith("repo-1", "origin");
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Tags traídos/)).toBeInTheDocument();
  });

  it("sube solo el tag elegido y vuelve a consultar el remoto", async () => {
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Subir tag v1.1.0" }));
    expect(api.pushTag).toHaveBeenCalledWith("repo-1", "origin", "v1.1.0");
    await waitFor(() => expect(api.listRemoteTags).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/«v1.1.0» subido/)).toBeInTheDocument();
  });

  it("un fallo de red al subir se muestra con contexto y detalle", async () => {
    vi.mocked(api.pushTag).mockRejectedValue({
      kind: "network",
      message: "Sin conexión con el remoto.",
      detail: "fatal: unable to access",
    });
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Subir tag v1.1.0" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo completar la operación con los tags");
    expect(alert).toHaveTextContent("Sin conexión");
    expect(alert).toHaveTextContent("fatal: unable to access");
  });

  it("muestra el progreso y permite cancelar la subida", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(api.pushTag).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Subir tag v1.1.0" }));
    act(() => emit({ operationId: "op-7", phase: "sending", percent: 40 }));
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.cancelOperation).toHaveBeenCalledWith("op-7");
    finish();
  });

  it("eliminar un tag local pide confirmación y refresca", async () => {
    const onChanged = await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar tag v1.1.0" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar tag" });
    expect(api.deleteTag).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(api.deleteTag).toHaveBeenCalledWith("repo-1", "v1.1.0");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("eliminar un tag remoto exige escribir su nombre", async () => {
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Consultar tags del remoto" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Eliminar tag remoto v1.0.0" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Eliminar tag remoto" });
    const confirm = within(dialog).getByRole("button", { name: "Eliminar" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Escribe/), "v1.0");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Escribe/), ".0");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(api.deleteRemoteTag).toHaveBeenCalledWith("repo-1", "origin", "v1.0.0");
    expect(api.deleteTag).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("un fallo al eliminar deja el diálogo abierto con el error", async () => {
    vi.mocked(api.deleteTag).mockRejectedValue({
      kind: "validation",
      message: "No existe el tag local «v1.1.0».",
      detail: null,
    });
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar tag v1.1.0" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No existe el tag local");
  });

  it("sin remotos deshabilita las acciones de red", async () => {
    vi.mocked(api.listRemotes).mockResolvedValue([]);
    render(
      <TagsPanel
        repository={repository}
        selectedOid={null}
        externalVersion={0}
        onChanged={vi.fn()}
      />,
    );
    await screen.findByRole("list", { name: "Tags del repositorio" });
    expect(screen.getByRole("button", { name: "Traer tags" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Consultar tags del remoto" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Subir tag/ })).toBeNull();
  });

  it("crea un tag anotado desde el diálogo", async () => {
    const onChanged = await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Crear tag" }));
    const dialog = screen.getByRole("dialog", { name: "Crear tag" });
    expect(within(dialog).getByRole("button", { name: "Crear" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Nombre del tag"), "v2.0.0");
    await userEvent.type(within(dialog).getByLabelText(/Mensaje/), "Segunda");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
    expect(api.createTag).toHaveBeenCalledWith("repo-1", "v2.0.0", null, "Segunda");
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("crea un tag ligero si no hay mensaje y muestra el motivo de un nombre inválido", async () => {
    vi.mocked(api.createTag).mockRejectedValue({
      kind: "validation",
      message: "«a b» no es un nombre de tag válido para Git.",
      detail: null,
    });
    const onChanged = await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Crear tag" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Nombre del tag"), "a b");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
    expect(api.createTag).toHaveBeenCalledWith("repo-1", "a b", null, null);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("nombre de tag válido");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
