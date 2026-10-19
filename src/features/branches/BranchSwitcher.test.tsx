import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";

import { BranchSwitcher } from "./BranchSwitcher";
import { filterBranches } from "./SwitchBranchDialog";
import type { BranchInfo } from "./types";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: { ...original.api, listBranches: vi.fn(), checkoutBranch: vi.fn() },
  };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

const branch = (name: string, extra: Partial<BranchInfo> = {}): BranchInfo => ({
  name,
  kind: "local",
  isCurrent: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  tipOid: "a".repeat(40),
  ...extra,
});

const BRANCHES: BranchInfo[] = [
  branch("main", { isCurrent: true }),
  branch("spec-11-cerrar"),
  branch("Feature-Login"),
  branch("origin/main", { kind: "remote" }),
  branch("origin/spec-03-grafo", { kind: "remote" }),
];

beforeEach(() => {
  vi.mocked(api.listBranches).mockReset().mockResolvedValue(BRANCHES);
  vi.mocked(api.checkoutBranch).mockReset().mockResolvedValue(undefined);
});

async function renderSwitcher(onChanged = vi.fn()) {
  render(<BranchSwitcher repository={repository} externalVersion={0} onChanged={onChanged} />);
  await screen.findByRole("button", { name: /main/ });
  return onChanged;
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /main/ }));
  return { user, dialog: await screen.findByRole("dialog", { name: "Cambiar de rama" }) };
}

describe("filterBranches", () => {
  it("filtra por texto sin distinguir mayúsculas y pone las locales primero", () => {
    expect(filterBranches(BRANCHES, "MAIN").map((b) => b.name)).toEqual(["main", "origin/main"]);
    expect(filterBranches(BRANCHES, "feature").map((b) => b.name)).toEqual(["Feature-Login"]);
    expect(filterBranches(BRANCHES, "  ").length).toBe(BRANCHES.length);
    expect(filterBranches(BRANCHES, "zzz")).toEqual([]);
    const kinds = filterBranches(BRANCHES, "").map((b) => b.kind);
    expect(kinds.indexOf("remote")).toBeGreaterThan(kinds.lastIndexOf("local"));
  });
});

describe("BranchSwitcher", () => {
  it("muestra la rama actual en el botón", async () => {
    await renderSwitcher();
    expect(screen.getByRole("button", { name: /main/ })).toBeInTheDocument();
  });

  it("indica el HEAD desacoplado cuando ninguna rama es la actual", async () => {
    vi.mocked(api.listBranches).mockResolvedValue([branch("main"), branch("otra")]);
    render(<BranchSwitcher repository={repository} externalVersion={0} onChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /HEAD desacoplado/ })).toBeInTheDocument();
  });

  it("abre un modal con el buscador enfocado y la lista de ramas locales y remotas", async () => {
    await renderSwitcher();
    const { dialog } = await openDialog();

    const search = within(dialog).getByRole("combobox", { name: "Buscar rama" });
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute("aria-controls");
    const options = within(dialog).getAllByRole("option");
    expect(options).toHaveLength(5);
    expect(within(dialog).getAllByText("remota")).toHaveLength(2);
    expect(within(options[0]).getByText("actual")).toBeInTheDocument();
  });

  it("el buscador filtra la lista", async () => {
    await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByRole("combobox"), "spec");
    const names = within(dialog)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toHaveLength(2);
    expect(names.every((n) => n!.includes("spec"))).toBe(true);

    await user.clear(within(dialog).getByRole("combobox"));
    await user.type(within(dialog).getByRole("combobox"), "nada-coincide");
    expect(within(dialog).queryAllByRole("option")).toHaveLength(0);
    expect(
      within(dialog).getByText(/Ninguna rama coincide con «nada-coincide»/),
    ).toBeInTheDocument();
  });

  it("al elegir una rama cambia, cierra el modal, avisa y refresca", async () => {
    const onChanged = await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("option", { name: /spec-11-cerrar/ }));

    await waitFor(() =>
      expect(api.checkoutBranch).toHaveBeenCalledWith("repo-1", "spec-11-cerrar"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent("Cambiaste a «spec-11-cerrar»");
    expect(onChanged).toHaveBeenCalled();
  });

  it("con el teclado: escribir, flecha abajo y Enter cambian de rama", async () => {
    await renderSwitcher();
    const { user, dialog } = await openDialog();
    const search = within(dialog).getByRole("combobox");

    await user.type(search, "spec");
    const first = within(dialog).getAllByRole("option")[0];
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(search).toHaveAttribute("aria-activedescendant", first.id);

    await user.keyboard("{ArrowDown}");
    const second = within(dialog).getAllByRole("option")[1];
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(search).toHaveAttribute("aria-activedescendant", second.id);
    await user.keyboard("{ArrowUp}{ArrowDown}{Enter}");

    await waitFor(() =>
      expect(api.checkoutBranch).toHaveBeenCalledWith("repo-1", "origin/spec-03-grafo"),
    );
  });

  it("Inicio y Fin saltan al primero y al último", async () => {
    await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.keyboard("{End}");
    const options = within(dialog).getAllByRole("option");
    expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("elegir una rama remota la pide por su nombre completo y avisa con el nombre local", async () => {
    await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("option", { name: /origin\/spec-03-grafo/ }));
    await waitFor(() =>
      expect(api.checkoutBranch).toHaveBeenCalledWith("repo-1", "origin/spec-03-grafo"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Cambiaste a «spec-03-grafo»");
  });

  it("elegir la rama actual no cambia nada y cierra", async () => {
    await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getAllByRole("option")[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.checkoutBranch).not.toHaveBeenCalled();
  });

  it("Esc cierra sin cambiar de rama", async () => {
    await renderSwitcher();
    const { user } = await openDialog();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.checkoutBranch).not.toHaveBeenCalled();
  });

  it("si Git se niega, el modal sigue abierto con el motivo y el detalle técnico", async () => {
    vi.mocked(api.checkoutBranch).mockRejectedValue({
      kind: "git",
      message: "Tienes cambios locales que se perderían al cambiar de rama: a.txt, b.txt.",
      detail:
        "error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt",
    });
    const onChanged = await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("option", { name: /spec-11-cerrar/ }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cambiar de rama");
    expect(alert).toHaveTextContent("a.txt, b.txt");
    expect(within(alert).getByText("Ver detalle técnico")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Cambiar de rama" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Un fallo no confirma nada: el aviso de «Cambiaste a…» no aparece.
    expect(onChanged).not.toHaveBeenCalledWith();
  });

  it("el foco queda dentro del modal y vuelve al botón al cerrar", async () => {
    await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: /main/ })).toHaveFocus());
  });

  it("no usa diálogos nativos", async () => {
    const confirm = vi.spyOn(window, "confirm");
    await renderSwitcher();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("option", { name: /Feature-Login/ }));
    await waitFor(() => expect(api.checkoutBranch).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
