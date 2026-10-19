// Criterio SPEC 11: la app no usa diálogos nativos del navegador (`confirm`, `alert`, `prompt`).
// No se pueden estilar, no respetan el tema y se ven distinto en cada sistema; para confirmar
// se usa el componente `Modal`.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// `window.confirm(`, `confirm(` suelto, etc. No cuenta `.confirm(` de otros objetos ni `onConfirm`.
const NATIVE_DIALOG = /(?<![.\w])(?:window\.)?(?:confirm|alert|prompt)\s*\(/;

/** Quita los comentarios: nombrar `confirm()` en un comentario no es usarlo. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("sin diálogos nativos", () => {
  it("el código de la app no llama a confirm, alert ni prompt", () => {
    const offenders = sources(root)
      .filter((file) => NATIVE_DIALOG.test(withoutComments(readFileSync(file, "utf8"))))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });

  it("los comentarios no cuentan", () => {
    expect(NATIVE_DIALOG.test(withoutComments("// no uses confirm('x')"))).toBe(false);
    expect(NATIVE_DIALOG.test(withoutComments("/* alert(1) */ const a = 1;"))).toBe(false);
    expect(NATIVE_DIALOG.test(withoutComments("const a = 1; confirm('x');"))).toBe(true);
  });

  it("la expresión detecta lo que debe y no da falsos positivos", () => {
    for (const bad of ["confirm('x')", "window.confirm('x')", "alert(1)", "window.prompt('a')"]) {
      expect(NATIVE_DIALOG.test(bad), bad).toBe(true);
    }
    for (const good of [
      "onConfirm()",
      "confirmRemove()",
      "dialog.confirm(x)",
      "const confirmed = 1",
    ]) {
      expect(NATIVE_DIALOG.test(good), good).toBe(false);
    }
  });
});
