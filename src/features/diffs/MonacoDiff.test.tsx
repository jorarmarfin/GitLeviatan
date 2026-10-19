import { describe, expect, it, vi } from "vitest";

// Guardia contra regresiones: Monaco debe usar el paquete local, nunca el CDN por defecto
// de @monaco-editor/react. Sin `loader.config({ monaco })` el cargador descarga de jsdelivr.
const loaderConfig = vi.hoisted(() => vi.fn());

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: () => null,
  loader: { config: loaderConfig },
}));
vi.mock("monaco-editor", () => ({ editor: {}, languages: {} }));
vi.mock("monaco-editor/editor/editor.worker?worker", () => ({ default: class FakeWorker {} }));
vi.mock("monaco-editor/language/json/json.worker?worker", () => ({ default: class FakeWorker {} }));
vi.mock("monaco-editor/language/css/css.worker?worker", () => ({ default: class FakeWorker {} }));
vi.mock("monaco-editor/language/html/html.worker?worker", () => ({ default: class FakeWorker {} }));
vi.mock("monaco-editor/language/typescript/ts.worker?worker", () => ({
  default: class FakeWorker {},
}));

describe("MonacoDiff", () => {
  it("configura el cargador con el Monaco empaquetado y registra los workers locales", async () => {
    await import("./MonacoDiff");
    expect(loaderConfig).toHaveBeenCalledTimes(1);
    const config = loaderConfig.mock.calls[0][0];
    expect(config.monaco).toBeDefined();
    expect(config.paths).toBeUndefined(); // sin URL de CDN

    const env = (
      self as unknown as {
        MonacoEnvironment: { getWorker: (id: string, label: string) => unknown };
      }
    ).MonacoEnvironment;
    for (const label of ["editor", "json", "css", "html", "typescript"]) {
      expect(env.getWorker("id", label)).toBeDefined();
    }
  });
});
