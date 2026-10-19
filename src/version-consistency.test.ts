// Criterio SPEC 11: la versión de la app es una sola. `tauri.conf.json` es la fuente (la usan los
// instaladores, el pie de la ventana y el workflow de release); las otras dos deben coincidir.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const tauriVersion: string = JSON.parse(read("src-tauri/tauri.conf.json")).version;
const packageVersion: string = JSON.parse(read("package.json")).version;
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(
  read("src-tauri/Cargo.toml").split("[dependencies]")[0],
)?.[1];

describe("una sola versión", () => {
  it("tauri.conf.json tiene una versión SemVer", () => {
    expect(tauriVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("package.json coincide con tauri.conf.json", () => {
    expect(packageVersion).toBe(tauriVersion);
  });

  it("Cargo.toml coincide con tauri.conf.json", () => {
    expect(cargoVersion).toBe(tauriVersion);
  });

  it("el último release del CHANGELOG no supera la versión actual", () => {
    const released = [...read("CHANGELOG.md").matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(
      (m) => m[1],
    );
    expect(released.length).toBeGreaterThan(0);
    // El primero es el más reciente: debe ser la versión actual, o una anterior si hay cambios sin publicar.
    const toNumber = (v: string) =>
      v
        .split(".")
        .map(Number)
        .reduce((a, n) => a * 1000 + n, 0);
    expect(toNumber(released[0])).toBeLessThanOrEqual(toNumber(tauriVersion));
  });
});
