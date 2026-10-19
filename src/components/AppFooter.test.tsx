import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { api } from "@/lib/api";

import { AppFooter } from "./AppFooter";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, getAppVersion: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(api.getAppVersion).mockReset();
});

describe("AppFooter", () => {
  it("muestra la versión que devuelve el backend", async () => {
    vi.mocked(api.getAppVersion).mockResolvedValue("1.4.2");
    render(<AppFooter />);
    expect(await screen.findByText("GitLeviatán v1.4.2")).toBeInTheDocument();
  });

  it("no muestra el ping heredado de la SPEC 01", async () => {
    vi.mocked(api.getAppVersion).mockResolvedValue("0.2.0");
    render(<AppFooter />);
    await screen.findByText("GitLeviatán v0.2.0");
    expect(screen.queryByText(/ping/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pong/i)).not.toBeInTheDocument();
  });

  it("si no se puede leer la versión, el pie sigue mostrando el nombre sin error", async () => {
    vi.mocked(api.getAppVersion).mockRejectedValue({
      kind: "internal",
      message: "fallo",
      detail: null,
    });
    render(<AppFooter />);
    await waitFor(() => expect(api.getAppVersion).toHaveBeenCalled());
    expect(screen.getByTestId("app-version")).toHaveTextContent(/^GitLeviatán$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("al desmontarse antes de recibir la versión no falla", async () => {
    let resolve: (v: string) => void = () => undefined;
    vi.mocked(api.getAppVersion).mockReturnValue(new Promise<string>((r) => (resolve = r)));
    const { unmount } = render(<AppFooter />);
    unmount();
    resolve("0.2.0");
    await Promise.resolve();
  });
});
