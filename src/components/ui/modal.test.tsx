import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "./modal";

function setup(onClose = vi.fn()) {
  render(
    <>
      <button>Fuera</button>
      <Modal title="Prueba" onClose={onClose}>
        <input aria-label="Uno" />
        <button>Dos</button>
      </Modal>
    </>,
  );
  return onClose;
}

describe("Modal (teclado)", () => {
  it("mueve el foco al primer elemento al abrirse", () => {
    setup();
    expect(screen.getByLabelText("Uno")).toHaveFocus();
  });

  it("Tab da la vuelta dentro del diálogo en ambos sentidos", async () => {
    setup();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Dos" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Uno")).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Dos" })).toHaveFocus();
  });

  it("Esc cierra", async () => {
    const onClose = setup();
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("devuelve el foco al cerrarse", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <Modal title="Prueba" onClose={() => undefined}>
        <button>Dentro</button>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Dentro" })).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
