import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CommitDetail } from "@/features/graph/types";
import { api } from "@/lib/api";
import type { CommitFile, CommitFiles, FileDiff } from "@/types/git";

import { CommitFilesView } from "./CommitFilesView";

vi.mock("@/features/diffs/MonacoDiff", () => ({
  default: ({ path, original, modified }: { path: string; original: string; modified: string }) => (
    <div data-testid="monaco" data-path={path}>
      {original}→{modified}
    </div>
  ),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  const fns = Object.fromEntries(Object.keys(original.api).map((name) => [name, vi.fn()]));
  return { ...original, api: fns };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };
const OID = "a".repeat(40);

const file = (over: Partial<CommitFile>): CommitFile => ({
  path: "x.txt",
  origPath: null,
  status: "modified",
  additions: 1,
  deletions: 0,
  isBinary: false,
  ...over,
});

const listing = (over: Partial<CommitFiles> = {}): CommitFiles => ({
  oid: OID,
  comparedWith: "b".repeat(40),
  isMerge: false,
  totalFiles: 3,
  truncated: false,
  files: [
    file({ path: "src/a.ts", additions: 12, deletions: 3 }),
    file({ path: "docs/b.md", status: "added", additions: 4, deletions: 0 }),
    file({ path: "img.png", status: "modified", additions: null, deletions: null, isBinary: true }),
  ],
  ...over,
});

const detail: CommitDetail = {
  oid: OID,
  shortOid: "aaaaaaa",
  parents: ["b".repeat(40)],
  author: "Ana",
  authoredAt: "2026-01-02T03:04:05+00:00",
  subject: "Arregla el login",
  refs: [],
  body: "",
  committer: "Ana",
  committedAt: "2026-01-02T03:04:05+00:00",
};

const diff = (over: Partial<FileDiff> = {}): FileDiff => ({
  path: "src/a.ts",
  original: "uno",
  modified: "dos",
  isBinary: false,
  tooLarge: false,
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(vi.mocked(api))) (fn as ReturnType<typeof vi.fn>).mockReset();
  vi.mocked(api.listCommitFiles).mockResolvedValue(listing());
  vi.mocked(api.getCommit).mockResolvedValue(detail);
  vi.mocked(api.getCommitFileDiff).mockResolvedValue(diff());
});

function renderView() {
  const onClose = vi.fn();
  render(<CommitFilesView repository={repository} oid={OID} onClose={onClose} />);
  return onClose;
}

describe("CommitFilesView", () => {
  it("muestra la cabecera, el resumen y la lista con estado y líneas", async () => {
    renderView();
    const list = within(await screen.findByRole("list", { name: "Archivos modificados" }));
    expect(list.getAllByRole("button")).toHaveLength(3);
    expect(list.getByRole("button", { name: "src/a.ts, Modificado" })).toHaveTextContent("+12 −3");
    expect(list.getByRole("button", { name: "docs/b.md, Añadido" })).toHaveTextContent("+4 −0");
    expect(list.getByRole("button", { name: "img.png, Modificado" })).toHaveTextContent("binario");
    expect(await screen.findByRole("heading", { name: "Arregla el login" })).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByText(/3 archivos, \+16 −3/)).toBeInTheDocument();
    expect(api.listCommitFiles).toHaveBeenCalledWith("repo-1", OID);
  });

  it("selecciona el primer archivo y muestra su diff", async () => {
    renderView();
    const first = await screen.findByRole("button", { name: "src/a.ts, Modificado" });
    expect(first).toHaveAttribute("aria-current", "true");
    expect(await screen.findByTestId("monaco")).toHaveTextContent("uno→dos");
    expect(api.getCommitFileDiff).toHaveBeenCalledWith("repo-1", OID, "src/a.ts", null);
  });

  it("al elegir otro archivo cambia el diff", async () => {
    vi.mocked(api.getCommitFileDiff).mockImplementation(async (_r, _o, path) =>
      diff({ path, original: "", modified: `contenido de ${path}` }),
    );
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "docs/b.md, Añadido" }));
    expect(await screen.findByText("→contenido de docs/b.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs/b.md, Añadido" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("las flechas de la lista mueven la selección", async () => {
    renderView();
    const first = await screen.findByRole("button", { name: "src/a.ts, Modificado" });
    first.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "docs/b.md, Añadido" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(api.getCommitFileDiff).toHaveBeenLastCalledWith("repo-1", OID, "docs/b.md", null);
  });

  it("el filtro reduce las filas sin recargar la lista", async () => {
    renderView();
    await screen.findByRole("list", { name: "Archivos modificados" });
    await userEvent.type(screen.getByLabelText("Filtrar archivos por nombre"), "DOCS");
    const buttons = within(screen.getByRole("list", { name: "Archivos modificados" })).getAllByRole(
      "button",
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("docs/b.md, Añadido");
    // El archivo elegido pasa a ser el único visible.
    expect(await screen.findByRole("button", { name: /docs\/b.md/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(api.listCommitFiles).toHaveBeenCalledTimes(1);

    await userEvent.clear(screen.getByLabelText("Filtrar archivos por nombre"));
    await userEvent.type(screen.getByLabelText("Filtrar archivos por nombre"), "zzz");
    expect(screen.getByText(/Ningún archivo coincide con «zzz»/)).toBeInTheDocument();
  });

  it("un renombrado muestra la ruta original y la pide para el diff", async () => {
    vi.mocked(api.listCommitFiles).mockResolvedValue(
      listing({
        totalFiles: 1,
        files: [file({ path: "nuevo.txt", origPath: "viejo.txt", status: "renamed" })],
      }),
    );
    renderView();
    expect(
      await screen.findByRole("button", { name: "viejo.txt → nuevo.txt, Renombrado" }),
    ).toBeInTheDocument();
    await screen.findByTestId("monaco");
    expect(api.getCommitFileDiff).toHaveBeenCalledWith("repo-1", OID, "nuevo.txt", "viejo.txt");
  });

  it("un commit de fusión lo indica y nombra el primer padre", async () => {
    vi.mocked(api.listCommitFiles).mockResolvedValue(listing({ isMerge: true }));
    renderView();
    expect(await screen.findByText(/cambios respecto al primer padre/)).toHaveTextContent(
      "bbbbbbb",
    );
  });

  it("con más de 500 archivos avisa del total real", async () => {
    vi.mocked(api.listCommitFiles).mockResolvedValue(listing({ totalFiles: 732, truncated: true }));
    renderView();
    expect(await screen.findByRole("status")).toHaveTextContent("primeros 3 de 732 archivos");
  });

  it("un commit sin archivos lo dice y no pide diff", async () => {
    vi.mocked(api.listCommitFiles).mockResolvedValue(listing({ totalFiles: 0, files: [] }));
    renderView();
    expect(await screen.findByText("Este commit no cambia archivos.")).toBeInTheDocument();
    expect(api.getCommitFileDiff).not.toHaveBeenCalled();
  });

  it("un binario o un archivo grande muestra un aviso en lugar del diff", async () => {
    vi.mocked(api.getCommitFileDiff).mockResolvedValueOnce(diff({ isBinary: true }));
    renderView();
    expect(await screen.findByText(/Archivo binario/)).toBeInTheDocument();
    expect(screen.queryByTestId("monaco")).toBeNull();

    vi.mocked(api.getCommitFileDiff).mockResolvedValueOnce(diff({ tooLarge: true }));
    await userEvent.click(screen.getByRole("button", { name: "docs/b.md, Añadido" }));
    expect(await screen.findByText(/supera 1 MiB/)).toBeInTheDocument();
  });

  it("un fallo al listar se muestra con contexto y detalle técnico", async () => {
    vi.mocked(api.listCommitFiles).mockRejectedValue({
      kind: "git",
      message: "Git falló",
      detail: "fatal: bad object",
    });
    renderView();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar los archivos del commit");
    expect(alert).toHaveTextContent("fatal: bad object");
  });

  it("un fallo al cargar el diff se muestra sin tumbar la lista", async () => {
    vi.mocked(api.getCommitFileDiff).mockRejectedValue({
      kind: "git",
      message: "no se pudo leer",
      detail: null,
    });
    renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el diff");
    expect(
      screen.getAllByRole("button", { name: /, (Modificado|Añadido)/ }).length,
    ).toBeGreaterThan(0);
  });

  it("si falla la cabecera la lista sigue funcionando", async () => {
    vi.mocked(api.getCommit).mockRejectedValue({ kind: "git", message: "x", detail: null });
    renderView();
    expect(await screen.findByRole("list", { name: "Archivos modificados" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Volver al historial y Escape cierran la vista", async () => {
    const onClose = renderView();
    await screen.findByRole("list", { name: "Archivos modificados" });
    await userEvent.click(screen.getByRole("button", { name: "Volver al historial" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("el foco empieza en Volver al historial", async () => {
    renderView();
    await screen.findByRole("list", { name: "Archivos modificados" });
    expect(screen.getByRole("button", { name: "Volver al historial" })).toHaveFocus();
  });
});
