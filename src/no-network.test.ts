// Criterio SPEC 08: la app no realiza peticiones de red salvo las operaciones Git solicitadas.
// Git es quien habla con los remotos; ni el frontend ni el backend Rust tienen cliente HTTP propio.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("sin peticiones de red propias", () => {
  const files = sourceFiles(path.join(root, "src"));

  it("el frontend no usa APIs de red del navegador", () => {
    // `api.fetch(…)` es el fetch de Git (comando Tauri), no `window.fetch`: se excluyen los métodos.
    const forbidden = /(?<![.\w])fetch\s*\(|\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/;
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("el frontend no referencia URLs http(s) (CDN, APIs, analítica)", () => {
    const offenders = files.filter((f) => /https?:\/\//.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("index.html no carga recursos externos", () => {
    expect(readFileSync(path.join(root, "index.html"), "utf8")).not.toMatch(
      /(src|href)=["']https?:/,
    );
  });

  it("la CSP solo permite el propio origen y el IPC de Tauri", () => {
    const config = JSON.parse(readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
    const csp: string = config.app.security.csp;
    expect(csp).toContain("default-src 'self'");
    const connect = /connect-src ([^;]*)/.exec(csp)?.[1] ?? "";
    expect(connect.split(/\s+/).sort()).toEqual(["'self'", "http://ipc.localhost", "ipc:"].sort());
  });

  it("el backend Rust no depende de ningún cliente HTTP", () => {
    const cargo = readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
    const dependencies = cargo.slice(cargo.indexOf("[dependencies]"));
    expect(dependencies).not.toMatch(
      /^\s*(reqwest|ureq|hyper|curl|isahc|surf|attohttpc|tauri-plugin-http)\b/m,
    );
  });
});
