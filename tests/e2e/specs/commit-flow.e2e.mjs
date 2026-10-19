// Flujo: abrir (desde recientes) → preparar un archivo → commit → verlo en el historial.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const repo = process.env.GL_E2E_REPO;
const MESSAGE = "Añade nuevo.txt desde el E2E";

describe("abrir → stage → commit → historial", () => {
  it("abre el repositorio desde la lista de recientes", async () => {
    const recent = await $("button=proyecto-e2e");
    await recent.waitForClickable();
    await recent.click();

    const history = await $('[role="listbox"][aria-label="Historial de commits"]');
    await history.waitForDisplayed();
    await browser.waitUntil(async () => (await $$('[role="option"]')).length === 1, {
      timeoutMsg: "el historial debería tener el commit inicial",
    });
    assert.match(await $('[role="option"]').getText(), /Commit inicial/);
  });

  it("prepara el archivo sin seguimiento", async () => {
    const stage = await $('button[aria-label="Preparar nuevo.txt"]');
    await stage.waitForClickable();
    await stage.click();

    const quit = await $('button[aria-label="Quitar de staged nuevo.txt"]');
    await quit.waitForDisplayed();
  });

  it("crea el commit con el mensaje", async () => {
    const box = await $('textarea[aria-label="Mensaje de commit"]');
    await box.setValue(MESSAGE);
    const commit = await $("button*=Commit (1)");
    await commit.waitForClickable();
    await commit.click();

    // Tras el commit el historial se recarga y el commit nuevo queda arriba.
    await browser.waitUntil(async () => (await $$('[role="option"]')).length === 2, {
      timeoutMsg: "el historial debería mostrar el commit nuevo",
    });
    const first = await $$('[role="option"]')[0];
    assert.match(await first.getText(), new RegExp(MESSAGE));
  });

  it("muestra el detalle del commit y coincide con lo que ve la CLI", async () => {
    const first = await $$('[role="option"]')[0];
    await first.click();
    const detail = await $('article[aria-label="Detalle del commit"]');
    await detail.waitForDisplayed();
    assert.match(await detail.getText(), new RegExp(MESSAGE));

    const subject = execFileSync("git", ["log", "-1", "--format=%s"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
    assert.equal(subject, MESSAGE);
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
    assert.equal(status.trim(), "");
  });
});
