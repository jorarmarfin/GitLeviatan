import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import type { BranchInfo } from "@/features/branches/types";
import type { SyncProgress } from "@/types/git";

import { SyncBar } from "./SyncBar";

let emit: (progress: SyncProgress) => void = () => undefined;
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, handler: (e: { payload: SyncProgress }) => void) => {
    emit = (payload) => handler({ payload });
    return () => undefined;
  }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      listRemotes: vi.fn(),
      listBranches: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      cancelOperation: vi.fn(),
    },
  };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

const main: BranchInfo = {
  name: "main",
  kind: "local",
  isCurrent: true,
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  tipOid: "a".repeat(40),
};

const progress = (percent: number | null): SyncProgress => ({
  operationId: "op-1",
  phase: "receiving",
  percent,
});

beforeEach(() => {
  vi.mocked(api.listRemotes)
    .mockReset()
    .mockResolvedValue([
      { name: "origin", fetchUrl: "https://h/r.git", pushUrl: "https://h/r.git" },
    ]);
  vi.mocked(api.listBranches).mockReset().mockResolvedValue([main]);
  vi.mocked(api.fetch).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.pull).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.push).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.cancelOperation).mockReset().mockResolvedValue(true);
});

async function renderBar(onChanged = vi.fn()) {
  render(<SyncBar repository={repository} externalVersion={0} onChanged={onChanged} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /fetch/i })).toBeEnabled());
  return onChanged;
}

describe("SyncBar", () => {
  it("hace fetch, pull y push contra el remoto del upstream", async () => {
    const onChanged = await renderBar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /fetch/i }));
    await user.click(screen.getByRole("button", { name: /pull/i }));
    await user.click(screen.getByRole("button", { name: /push/i }));

    expect(api.fetch).toHaveBeenCalledWith("repo-1", "origin");
    expect(api.pull).toHaveBeenCalledWith("repo-1", "origin", "main");
    expect(api.push).toHaveBeenCalledWith("repo-1", "origin", "main");
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(3));
  });

  it("deshabilita todo sin remotos", async () => {
    vi.mocked(api.listRemotes).mockResolvedValue([]);
    render(<SyncBar repository={repository} externalVersion={0} onChanged={vi.fn()} />);
    await waitFor(() => expect(api.listBranches).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /fetch/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /push/i })).toBeDisabled();
  });

  it("muestra progreso y permite cancelar", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(api.fetch).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await renderBar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /fetch/i }));
    const cancel = await screen.findByRole("button", { name: /cancelar/i });
    // Hasta el primer evento no se conoce el operationId.
    expect(cancel).toBeDisabled();

    act(() => emit(progress(42)));
    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByRole("button", { name: /fetch/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(api.cancelOperation).toHaveBeenCalledWith("op-1");

    finish();
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /fetch/i })).toBeEnabled();
  });

  it("muestra una cancelación como aviso, no como error", async () => {
    vi.mocked(api.fetch).mockRejectedValue({
      kind: "cancelled",
      message: "Operación cancelada.",
      detail: "",
    });
    await renderBar();
    await userEvent.setup().click(screen.getByRole("button", { name: /fetch/i }));

    expect(await screen.findByText("Operación cancelada.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("indica 'sin conexión' ante un error de red y lo limpia al reintentar con éxito", async () => {
    vi.mocked(api.fetch).mockRejectedValueOnce({
      kind: "network",
      message: "Sin conexión con el remoto. Revisa tu red e inténtalo de nuevo.",
      detail: "fatal: unable to access",
    });
    await renderBar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /fetch/i }));
    expect(await screen.findByText("Sin conexión al remoto")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sin conexión con el remoto");
    expect(screen.getByRole("button", { name: /fetch/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /fetch/i }));
    await waitFor(() =>
      expect(screen.queryByText("Sin conexión al remoto")).not.toBeInTheDocument(),
    );
  });

  it("explica un push rechazado y ofrece el detalle técnico", async () => {
    vi.mocked(api.push).mockRejectedValue({
      kind: "nonFastForward",
      message: "El remoto tiene cambios que no tienes en local.",
      detail: " ! [rejected] main -> main (non-fast-forward)",
    });
    await renderBar();
    await userEvent.setup().click(screen.getByRole("button", { name: /push/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El remoto tiene cambios");
    expect(screen.getByText("Ver detalle técnico")).toBeInTheDocument();
  });
});
