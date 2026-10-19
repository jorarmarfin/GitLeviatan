import { describe, expect, it } from "vitest";

import { EXCEPCIONES_DESARROLLO, isAllowed } from "./check-licenses.mjs";

describe("isAllowed", () => {
  it("acepta licencias permisivas", () => {
    for (const id of ["MIT", "Apache-2.0", "ISC", "BSD-3-Clause", "MPL-2.0"]) {
      expect(isAllowed(id)).toBe(true);
    }
  });

  it("OR basta con una alternativa admitida", () => {
    expect(isAllowed("(MPL-2.0 OR Apache-2.0)")).toBe(true);
    expect(isAllowed("GPL-2.0-only OR MIT")).toBe(true);
  });

  it("AND exige todas", () => {
    expect(isAllowed("MIT AND Apache-2.0")).toBe(true);
    expect(isAllowed("MIT AND GPL-2.0-only")).toBe(false);
  });

  it("rechaza licencias incompatibles o propietarias", () => {
    for (const id of [
      "GPL-2.0-only",
      "AGPL-3.0-only",
      "SEE LICENSE IN LICENSE.txt",
      "UNLICENSED",
    ]) {
      expect(isAllowed(id)).toBe(false);
    }
  });

  it("PSF-2.0 y CC-BY-3.0 solo valen para herramientas de desarrollo", () => {
    expect(isAllowed("PSF-2.0")).toBe(false);
    expect(isAllowed("PSF-2.0", new Set(["PSF-2.0"]))).toBe(true);
    expect(isAllowed("CC-BY-3.0")).toBe(false);
  });

  it("las excepciones sin licencia son una lista corta y explícita", () => {
    expect([...EXCEPCIONES_DESARROLLO]).toEqual(["css-value"]);
  });
});
