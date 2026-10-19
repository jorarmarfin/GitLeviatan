import { describe, expect, it } from "vitest";

import { cloneDestination, repoNameFromUrl } from "./cloneDestination";

describe("repoNameFromUrl", () => {
  it.each([
    ["git@github.com:usuario/proyecto.git", "proyecto"],
    ["https://github.com/usuario/proyecto.git", "proyecto"],
    ["https://usuario:token@host.com/a/proyecto/", "proyecto"],
    ["ssh://git@host/proyecto", "proyecto"],
    ["", "repositorio"],
  ])("%s → %s", (url, name) => {
    expect(repoNameFromUrl(url)).toBe(name);
  });

  it("nunca incluye credenciales en el nombre", () => {
    expect(repoNameFromUrl("https://usuario:token@host.com/a/p.git")).not.toContain("token");
  });
});

describe("cloneDestination", () => {
  it("une carpeta y nombre", () => {
    expect(cloneDestination("/home/u/", "git@h:o/r.git")).toBe("/home/u/r");
    expect(cloneDestination("C:\\Users\\u", "https://h/o/r.git")).toBe("C:\\Users\\u\\r");
  });
});
