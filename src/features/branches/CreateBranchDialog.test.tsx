import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { CreateTagDialog } from "@/features/tags/CreateTagDialog";

import { CreateBranchDialog } from "./CreateBranchDialog";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  const fns = Object.fromEntries(Object.keys(original.api).map((name) => [name, vi.fn()]));
  return { ...original, api: fns };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };
const commit = "c".repeat(40);

beforeEach(() => {
  for (const fn of Object.values(vi.mocked(api))) (fn as ReturnType<typeof vi.fn>).mockReset();
  vi.mocked(api.listBranches).mockResolvedValue([]);
  vi.mocked(api.listTags).mockResolvedValue([]);
  vi.mocked(api.createBranch).mockResolvedValue(undefined);
  vi.mocked(api.checkoutBranch).mockResolvedValue(undefined);
  vi.mocked(api.createTag).mockResolvedValue(undefined);
});

describe("«Crear … aquí» desde un commit", () => {
  it("la rama se abre con el commit preseleccionado", async () => {
    const onChanged = vi.fn();
    render(
      <CreateBranchDialog
        repository={repository}
        selectedOid={commit}
        initialStart={{ kind: "commit", value: "" }}
        onChanged={onChanged}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Desde el commit seleccionado \(ccccccc\)/)).toBeChecked();
    await userEvent.type(screen.getByLabelText("Nombre de la rama"), "desde-aqui");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(api.createBranch).toHaveBeenCalledWith("repo-1", "desde-aqui", commit);
    expect(api.checkoutBranch).toHaveBeenCalledWith("repo-1", "desde-aqui");
  });

  it("el tag se abre con el commit preseleccionado", async () => {
    const onChanged = vi.fn();
    render(
      <CreateTagDialog
        repository={repository}
        selectedOid={commit}
        initialStart={{ kind: "commit", value: "" }}
        onChanged={onChanged}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Desde el commit seleccionado \(ccccccc\)/)).toBeChecked();
    await userEvent.type(screen.getByLabelText("Nombre del tag"), "v0.1.0");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(api.createTag).toHaveBeenCalledWith("repo-1", "v0.1.0", commit, null);
  });
});
