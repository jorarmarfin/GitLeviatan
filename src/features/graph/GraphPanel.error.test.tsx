import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { api } from "@/lib/api";

import { GraphPanel } from "./GraphPanel";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, listCommits: vi.fn() } };
});

describe("GraphPanel (errores)", () => {
  it("un fallo al cargar el historial ofrece el detalle técnico", async () => {
    vi.mocked(api.listCommits).mockRejectedValue({
      kind: "git",
      message: "fatal: bad object HEAD",
      detail: "fatal: bad object HEAD\nerror: no se pudo leer",
    });
    render(
      <GraphPanel
        repository={{ id: "repo-1", path: "/tmp/r", name: "r" }}
        selectedOid={null}
        onSelect={vi.fn()}
      />,
    );
    expect(await screen.findByText("No se pudo cargar el historial")).toBeInTheDocument();
    expect(screen.getByText("Ver detalle técnico")).toBeInTheDocument();
  });
});
