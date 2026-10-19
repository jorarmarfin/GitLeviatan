// Contraste WCAG AA (SPEC 08): texto normal ≥ 4,5:1 y elementos no textuales (foco) ≥ 3:1,
// en tema claro y oscuro, calculado a partir de los tokens reales de `src/index.css`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { contrastRatio, over, parseOklch, type Color } from "@/lib/contrast";

const css = readFileSync(path.resolve(import.meta.dirname, "index.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`Bloque ${selector} no encontrado en index.css`);
  const result: Record<string, string> = {};
  for (const m of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) result[m[1]] = m[2].trim();
  return result;
}

const themes = {
  claro: tokens(":root"),
  oscuro: { ...tokens(":root"), ...tokens("\\.dark") },
};

for (const [name, t] of Object.entries(themes)) {
  const c = (token: string) => parseOklch(t[token]);
  const background = c("background");

  // [texto, fondo, descripción]: las combinaciones que la interfaz usa de verdad.
  const text: [string, Color, Color][] = [
    ["foreground sobre background", c("foreground"), background],
    ["card-foreground sobre card", c("card-foreground"), c("card")],
    ["primary-foreground sobre primary", c("primary-foreground"), c("primary")],
    ["secondary-foreground sobre secondary", c("secondary-foreground"), c("secondary")],
    ["accent-foreground sobre accent", c("accent-foreground"), c("accent")],
    ["foreground sobre secondary (etiquetas de rama)", c("foreground"), c("secondary")],
    ["foreground sobre accent (fila seleccionada, etiquetas de tag)", c("foreground"), c("accent")],
    ["foreground sobre card", c("foreground"), c("card")],
    ["muted-foreground sobre background", c("muted-foreground"), background],
    ["muted-foreground sobre card (diálogos)", c("muted-foreground"), c("card")],
    ["muted-foreground sobre muted", c("muted-foreground"), c("muted")],
    ["muted-foreground sobre accent (fila seleccionada)", c("muted-foreground"), c("accent")],
    ["destructive sobre background", c("destructive"), background],
    ["destructive sobre card", c("destructive"), c("card")],
    [
      "destructive sobre banner destructive/10",
      c("destructive"),
      over({ ...c("destructive"), alpha: 0.1 }, background),
    ],
    [
      "destructive-foreground sobre botón destructive",
      c("destructive-foreground"),
      c("destructive"),
    ],
  ];

  describe(`contraste AA, tema ${name}`, () => {
    it.each(text)("%s ≥ 4,5:1", (_label, fg, bg) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it("el anillo de foco contrasta ≥ 3:1 con el fondo y con la tarjeta", () => {
      expect(contrastRatio(c("ring"), background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c("ring"), c("card"))).toBeGreaterThanOrEqual(3);
    });
  });
}
