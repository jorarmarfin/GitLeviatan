import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useRepositoryStore } from "@/stores/repository";

import { CloseRepositoryButton } from "./CloseRepositoryButton";

const repo = { id: "repo-1", path: "/home/ana/proyecto", name: "proyecto" };

beforeEach(() => {
  useRepositoryStore.setState({
    active: null,
    recents: [],
    opening: false,
    error: null,
    syncRunning: false,
  });
});

describe("CloseRepositoryButton", () => {
  it("no aparece sin un repositorio abierto", () => {
    render(<CloseRepositoryButton />);
    expect(screen.queryByRole("button", { name: "Cerrar repositorio" })).not.toBeInTheDocument();
  });

  it("cierra el repositorio y vuelve a la pantalla inicial", async () => {
    useRepositoryStore.setState({ active: repo });
    render(<CloseRepositoryButton />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar repositorio" }));
    expect(useRepositoryStore.getState().active).toBeNull();
  });

  it("se deshabilita durante un fetch, pull o push y explica el motivo", () => {
    useRepositoryStore.setState({ active: repo, syncRunning: true });
    render(<CloseRepositoryButton />);

    const button = screen.getByRole("button", { name: "Cerrar repositorio" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("fetch, pull o push"));
    // El motivo también está visible y asociado al botón.
    expect(screen.getByText("Operación de red en curso")).toBeVisible();
    expect(button).toHaveAccessibleDescription(/Operación de red en curso/);
  });

  it("vuelve a habilitarse al terminar la operación", () => {
    useRepositoryStore.setState({ active: repo, syncRunning: true });
    const { rerender } = render(<CloseRepositoryButton />);
    useRepositoryStore.getState().setSyncRunning(false);
    rerender(<CloseRepositoryButton />);
    expect(screen.getByRole("button", { name: "Cerrar repositorio" })).toBeEnabled();
    expect(screen.queryByText("Operación de red en curso")).not.toBeInTheDocument();
  });

  it("se alcanza con Tab y se activa con Enter y con Espacio", async () => {
    useRepositoryStore.setState({ active: repo });
    const user = userEvent.setup();
    render(<CloseRepositoryButton />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Cerrar repositorio" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(useRepositoryStore.getState().active).toBeNull();

    act(() => useRepositoryStore.setState({ active: repo }));
    (await screen.findByRole("button", { name: "Cerrar repositorio" })).focus();
    await user.keyboard(" ");
    expect(useRepositoryStore.getState().active).toBeNull();
  });
});
