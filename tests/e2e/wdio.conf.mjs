// E2E con tauri-driver (WebDriver). Requiere: `cargo install tauri-driver --locked`,
// `WebKitWebDriver` (paquete webkit2gtk-driver) y un build de la app:
//   pnpm tauri build --debug --no-bundle
// Ejecución: `pnpm e2e` (en CI, bajo xvfb-run). Ver docs/e2e.md.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFixture } from "./fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const application = path.join(root, "src-tauri", "target", "debug", "gitleviatan");
// La config se importa también en cada worker: el fixture se crea solo en `onPrepare` (proceso
// principal) y se comparte con los workers por variables de entorno.
let fixture;
let driver;

export const config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.mjs"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  capabilities: [{ maxInstances: 1, "tauri:options": { application } }],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 60_000 },
  waitforTimeout: 15_000,

  onPrepare() {
    fixture = createFixture();
    process.env.GL_E2E_REPO = fixture.repo;
    process.env.GL_E2E_CONFIG_HOME = fixture.configHome;
  },

  beforeSession() {
    driver = spawn(path.join(os.homedir(), ".cargo", "bin", "tauri-driver"), [], {
      stdio: [null, process.stdout, process.stderr],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: process.env.GL_E2E_CONFIG_HOME,
        GIT_TERMINAL_PROMPT: "0",
      },
    });
  },

  afterSession() {
    driver?.kill();
  },

  onComplete() {
    fixture?.cleanup();
  },
};
