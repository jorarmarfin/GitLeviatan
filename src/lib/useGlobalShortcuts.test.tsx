import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "@/components/ui/modal";

import { useGlobalShortcuts } from "./useGlobalShortcuts";

function Harness({ onPreferences, modal = false }: { onPreferences: () => void; modal?: boolean }) {
  useGlobalShortcuts({ onPreferences });
  return (
    <>
      <aside data-area="sidebar">
        <button>Rama</button>
      </aside>
      <main data-area="graph">
        <div role="listbox" tabIndex={0} aria-label="Historial" />
      </main>
      <section data-area="changes">
        <button>Preparar</button>
      </section>
      {modal && (
        <Modal title="Diálogo" onClose={() => undefined}>
          <button>Dentro</button>
        </Modal>
      )}
    </>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("atajos globales", () => {
  it("Alt+1/2/3 mueven el foco entre las zonas", async () => {
    render(<Harness onPreferences={vi.fn()} />);
    const user = userEvent.setup();

    await user.keyboard("{Alt>}2{/Alt}");
    expect(screen.getByRole("listbox")).toHaveFocus();
    await user.keyboard("{Alt>}1{/Alt}");
    expect(screen.getByRole("button", { name: "Rama" })).toHaveFocus();
    await user.keyboard("{Alt>}3{/Alt}");
    expect(screen.getByRole("button", { name: "Preparar" })).toHaveFocus();
  });

  it("Ctrl+, abre las preferencias", async () => {
    const onPreferences = vi.fn();
    render(<Harness onPreferences={onPreferences} />);
    await userEvent.setup().keyboard("{Control>},{/Control}");
    expect(onPreferences).toHaveBeenCalledTimes(1);
  });

  it("se ignoran con un diálogo abierto", async () => {
    const onPreferences = vi.fn();
    render(<Harness onPreferences={onPreferences} modal />);
    const user = userEvent.setup();
    await user.keyboard("{Control>},{/Control}");
    await user.keyboard("{Alt>}2{/Alt}");
    expect(onPreferences).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).not.toHaveFocus();
  });
});
