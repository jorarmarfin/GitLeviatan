import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ErrorNotice } from "./ErrorNotice";

describe("ErrorNotice", () => {
  it("muestra contexto, mensaje y detalle técnico plegado", async () => {
    render(
      <ErrorNotice
        title="No se pudo hacer push"
        error={{ message: "El remoto rechazó el push.", detail: "! [rejected] main -> main" }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo hacer push");
    expect(screen.getByText("El remoto rechazó el push.")).toBeInTheDocument();

    const summary = screen.getByText("Ver detalle técnico");
    await userEvent.click(summary);
    expect(screen.getByText("! [rejected] main -> main")).toBeVisible();
  });

  it("sin detalle no ofrece el desplegable", () => {
    render(<ErrorNotice error={{ message: "Algo falló", detail: null }} />);
    expect(screen.queryByText("Ver detalle técnico")).not.toBeInTheDocument();
  });
});
