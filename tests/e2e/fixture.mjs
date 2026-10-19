// Entorno aislado para el E2E: un repositorio temporal y una carpeta de configuración propia
// donde `recent.json` ya lista el repositorio (así «abrir» se hace desde la UI, sin diálogos nativos).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IDENTIFIER = "dev.gitleviatan.app";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitleviatan-e2e-"));
  const repo = path.join(root, "proyecto-e2e");
  const configHome = path.join(root, "config");
  fs.mkdirSync(repo, { recursive: true });

  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Prueba E2E");
  git(repo, "config", "user.email", "e2e@example.com");
  git(repo, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(repo, "LEEME.md"), "# Proyecto\n");
  git(repo, "add", "LEEME.md");
  git(repo, "commit", "-q", "-m", "Commit inicial");
  // Un archivo sin seguimiento que el test preparará y commiteará desde la UI.
  fs.writeFileSync(path.join(repo, "nuevo.txt"), "hola desde el E2E\n");

  const appConfig = path.join(configHome, IDENTIFIER);
  fs.mkdirSync(appConfig, { recursive: true });
  fs.writeFileSync(
    path.join(appConfig, "recent.json"),
    JSON.stringify({
      version: 1,
      repositories: [{ path: repo, name: "proyecto-e2e", lastOpenedAt: new Date().toISOString() }],
    }),
  );

  return {
    root,
    repo,
    configHome,
    git: (...args) => git(repo, ...args),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
