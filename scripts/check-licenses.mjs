#!/usr/bin/env node
// Comprueba que las licencias de las dependencias de npm son compatibles con GPL-3.0-or-later.
// Uso: node scripts/check-licenses.mjs   (pnpm licenses:check)
// Las de Rust las comprueba `cargo deny check licenses` (src-tauri/deny.toml).
//
// - Dependencias de producción (lo que se distribuye): solo la lista PERMITIDAS, sin excepciones.
// - Herramientas de desarrollo y pruebas (no se distribuyen): lista ampliada y excepciones con nombre.
import { execFileSync } from "node:child_process";

// Permisivas y de copyleft débil compatibles con GPLv3 (ver docs/decisions/0003-auditoria-dependencias.md).
const PERMITIDAS = new Set([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "MPL-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "CC-BY-4.0", // solo datos (caniuse-lite)
  "Unlicense",
  "Zlib",
  "Python-2.0",
]);

// Solo para herramientas de desarrollo: licencias de datos/documentación o compatibles con GPL.
const SOLO_DESARROLLO = new Set(["PSF-2.0", "CC-BY-3.0"]);

// Paquetes de desarrollo sin licencia declarada, revisados a mano. Cualquier otro «Unknown» falla.
export const EXCEPCIONES_DESARROLLO = new Set(["css-value"]);

/** `A OR B` basta con que una sea admitida; `A AND B` exige todas. */
export function isAllowed(expression, extra = new Set()) {
  const clean = expression.replace(/[()]/g, " ").trim();
  return clean.split(/\s+OR\s+/).some((alternative) =>
    alternative
      .split(/\s+AND\s+/)
      .map((id) => id.trim())
      .every((id) => PERMITIDAS.has(id) || extra.has(id)),
  );
}

function listLicenses(prodOnly) {
  const args = ["licenses", "list", "--json", ...(prodOnly ? ["--prod"] : [])];
  const out = execFileSync("pnpm", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

function rejected(byLicense, extra, exceptions = new Set()) {
  const result = [];
  for (const [license, pkgs] of Object.entries(byLicense)) {
    if (isAllowed(license, extra)) continue;
    const names = pkgs.map((p) => p.name).filter((name) => !exceptions.has(name));
    if (names.length > 0) result.push([license, names]);
  }
  return result;
}

function main() {
  const prod = listLicenses(true);
  const all = listLicenses(false);
  const problems = [
    ...rejected(prod, new Set()).map(([l, n]) => ["producción", l, n]),
    ...rejected(all, SOLO_DESARROLLO, EXCEPCIONES_DESARROLLO).map(([l, n]) => ["desarrollo", l, n]),
  ];

  const total = Object.values(all).reduce((n, pkgs) => n + pkgs.length, 0);
  if (problems.length === 0) {
    console.log(`✅ ${total} dependencias de npm con licencias compatibles.`);
    return;
  }
  console.error("❌ Licencias no admitidas:");
  for (const [scope, license, names] of problems) {
    console.error(`  [${scope}] ${license}: ${names.join(", ")}`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
