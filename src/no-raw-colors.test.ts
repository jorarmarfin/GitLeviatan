// Criterio SPEC 10: ningún componente usa colores fuera de los tokens de `src/index.css`.
// Los tokens existen para ambos temas y los valida `index.contrast.test.ts`; un color suelto
// (`text-red-500`, `#fff`, `rgb(…)`) se saltaría las dos cosas.
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

// Módulos que no pintan nada: interpretan los tokens, así que mencionan `oklch(`.
const EXEMPT = new Set(["lib/contrast.ts"]);

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITY =
  "bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|accent|caret|decoration";

const RAW_COLOR = new RegExp(
  [
    // Paleta de Tailwind: `text-red-500`, `bg-green-100/50`…
    `\\b(?:${UTILITY})-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?\\b`,
    // `bg-black`, `text-white`, con o sin opacidad.
    `\\b(?:${UTILITY})-(?:black|white)(?:/\\d+)?\\b`,
    // Colores literales.
    "#[0-9a-fA-F]{3,8}\\b",
    "\\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\\(",
  ].join("|"),
);

describe("colores solo desde tokens", () => {
  it("ningún componente ni módulo usa colores sueltos", () => {
    const offenders = sources(root)
      .filter((file) => !EXEMPT.has(path.relative(root, file).split(path.sep).join("/")))
      .map((file) => ({ file, match: RAW_COLOR.exec(readFileSync(file, "utf8")) }))
      .filter(({ match }) => match !== null)
      .map(({ file, match }) => `${path.relative(root, file)}: ${match![0]}`);
    expect(offenders).toEqual([]);
  });

  it("la expresión detecta lo que debe", () => {
    for (const bad of [
      "text-red-500",
      "bg-green-100/50",
      "bg-black/50",
      "text-white",
      "#ff0000",
      "rgb(1,2,3)",
    ]) {
      expect(RAW_COLOR.test(bad), bad).toBe(true);
    }
    for (const good of [
      "text-primary",
      "bg-change-added",
      "bg-selected",
      "text-destructive",
      "border-border",
      "var(--graph-0)",
    ]) {
      expect(RAW_COLOR.test(good), good).toBe(false);
    }
  });
});
