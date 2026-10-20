// SPEC 14: doble clic en un commit abre sus archivos a pantalla completa y volver deja el historial como estaba.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";

import { Workspace } from "./Workspace";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

vi.mock("@/features/diffs/MonacoDiff", () => ({
  default: ({ modified }: { modified: string }) => <div data-testid="monaco">{modified}</div>,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  const fns = Object.fromEntries(Object.keys(original.api).map((name) => [name, vi.fn()]));
  return { ...original, api: fns };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };
const commit = (n: number) => ({
  oid: `oid${n}`,
  shortOid: `s${n}`,
  parents: n > 1 ? [`oid${n - 1}`] : [],
  author: "Ana",
  authoredAt: "2026-01-02T03:04:05+00:00",
  subject: `Commit ${n}`,
  refs: [],
});

beforeEach(() => {
  useRepositoryStore.setState({ active: repository, recents: [], opening: false, error: null });
  for (const fn of Object.values(vi.mocked(api))) (fn as ReturnType<typeof vi.fn>).mockReset();
  vi.mocked(api.listCommits).mockResolvedValue({
    commits: [commit(3), commit(2), commit(1)],
    nextCursor: null,
  });
  vi.mocked(api.getCommit).mockImplementation(async (_id, oid) => ({
    ...commit(Number(oid.replace("oid", ""))),
    body: "",
    committer: "Ana",
    committedAt: "2026-01-02T03:04:05+00:00",
  }));
  vi.mocked(api.getStatus).mockResolvedValue({
    branch: "main",
    detachedHead: false,
    staged: [],
    unstaged: [],
    untracked: [],
  });
  vi.mocked(api.listRecentRepositories).mockResolvedValue([]);
  vi.mocked(api.listBranches).mockResolvedValue([]);
  vi.mocked(api.listRemotes).mockResolvedValue([]);
  vi.mocked(api.listTags).mockResolvedValue([]);
  vi.mocked(api.listCommitFiles).mockResolvedValue({
    oid: "oid2",
    comparedWith: "oid1",
    isMerge: false,
    totalFiles: 1,
    truncated: false,
    files: [
      {
        path: "a.txt",
        origPath: null,
        status: "modified",
        additions: 1,
        deletions: 1,
        isBinary: false,
      },
    ],
  });
  vi.mocked(api.getCommitFileDiff).mockResolvedValue({
    path: "a.txt",
    original: "viejo",
    modified: "nuevo",
    isBinary: false,
    tooLarge: false,
  });
});

async function renderWorkspace() {
  render(
    <div className="relative">
      <Workspace repository={repository} />
    </div>,
  );
  return screen.findByRole("option", { name: /Commit 2/ });
}

describe("archivos de un commit", () => {
  it("el clic simple solo muestra el detalle", async () => {
    await userEvent.click(await renderWorkspace());
    expect(await screen.findByRole("article", { name: "Detalle del commit" })).toBeInTheDocument();
    expect(api.listCommitFiles).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Archivos del commit" })).toBeNull();
  });

  it("el doble clic abre la vista a pantalla completa con la lista y el diff", async () => {
    await userEvent.dblClick(await renderWorkspace());
    const view = await screen.findByRole("region", { name: "Archivos del commit" });
    expect(api.listCommitFiles).toHaveBeenCalledWith("repo-1", "oid2");
    expect(
      await within(view).findByRole("button", { name: "a.txt, Modificado" }),
    ).toBeInTheDocument();
    expect(await within(view).findByTestId("monaco")).toHaveTextContent("nuevo");
    // Lo de debajo queda inerte mientras la vista está abierta.
    expect(document.querySelector("[inert]")).not.toBeNull();
  });

  it("Volver conserva la selección del grafo y le devuelve el foco", async () => {
    const row = await renderWorkspace();
    await userEvent.dblClick(row);
    await userEvent.click(await screen.findByRole("button", { name: "Volver al historial" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Archivos del commit" })).toBeNull(),
    );
    expect(document.querySelector("[inert]")).toBeNull();
    expect(screen.getByRole("option", { name: /Commit 2/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // El historial no se recargó: sigue montado debajo.
    expect(api.listCommits).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole("listbox", { name: "Historial de commits" })).toHaveFocus(),
    );
  });

  it("Enter con el foco en el historial abre el commit seleccionado y Esc vuelve", async () => {
    await userEvent.click(await renderWorkspace());
    screen.getByRole("listbox", { name: "Historial de commits" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("region", { name: "Archivos del commit" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Archivos del commit" })).toBeNull(),
    );
  });

  describe("menú contextual de un commit", () => {
    async function openMenu() {
      const row = await renderWorkspace();
      await userEvent.pointer({ keys: "[MouseRight]", target: row });
      return screen.getByRole("menu", { name: /Acciones del commit oid2/ });
    }

    it("el clic derecho selecciona el commit y ofrece las acciones", async () => {
      const menu = await openMenu();
      expect(screen.getByRole("option", { name: /Commit 2/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((i) => i.textContent),
      ).toEqual([
        "Ver archivos del commit",
        "Crear rama aquí…",
        "Crear tag aquí…",
        "Copiar identificador (oid)",
      ]);
    });

    it("«Ver archivos del commit» abre la vista a pantalla completa", async () => {
      const menu = await openMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Ver archivos del commit" }),
      );
      expect(
        await screen.findByRole("region", { name: "Archivos del commit" }),
      ).toBeInTheDocument();
      expect(api.listCommitFiles).toHaveBeenCalledWith("repo-1", "oid2");
    });

    it("«Crear rama aquí…» y «Crear tag aquí…» abren el diálogo con ese commit elegido", async () => {
      let menu = await openMenu();
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Crear rama aquí…" }));
      let dialog = await screen.findByRole("dialog", { name: "Crear rama" });
      expect(within(dialog).getByLabelText(/Desde el commit seleccionado \(oid2\)/)).toBeChecked();
      await userEvent.keyboard("{Escape}");

      await userEvent.pointer({
        keys: "[MouseRight]",
        target: screen.getByRole("option", { name: /Commit 2/ }),
      });
      menu = screen.getByRole("menu");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Crear tag aquí…" }));
      dialog = await screen.findByRole("dialog", { name: "Crear tag" });
      expect(within(dialog).getByLabelText(/Desde el commit seleccionado \(oid2\)/)).toBeChecked();
    });

    it("«Copiar identificador» copia el oid al portapapeles", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      const menu = await openMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Copiar identificador (oid)" }),
      );
      expect(writeText).toHaveBeenCalledWith("oid2");
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("Escape cierra el menú sin hacer nada", async () => {
      await openMenu();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).toBeNull();
      expect(api.listCommitFiles).not.toHaveBeenCalled();
    });
  });
});
