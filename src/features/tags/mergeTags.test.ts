import { describe, expect, it } from "vitest";

import { mergeTags } from "./mergeTags";
import type { TagInfo } from "./types";

const tag = (name: string, targetOid = "a".repeat(40)): TagInfo => ({
  name,
  kind: "annotated",
  targetOid,
  tagOid: "t".repeat(40),
  message: "m",
  taggerDate: "2026-10-19T10:00:00+00:00",
  existsLocal: true,
  existsRemote: null,
});

describe("mergeTags", () => {
  it("sin consulta al remoto deja existsRemote en null", () => {
    const rows = mergeTags([tag("v1.0.0")], null);
    expect(rows).toHaveLength(1);
    expect(rows[0].existsRemote).toBeNull();
    expect(rows[0].divergent).toBe(false);
  });

  it("marca los que existen en el remoto y los que solo están en local", () => {
    const rows = mergeTags(
      [tag("v1.0.0"), tag("local")],
      [{ name: "v1.0.0", targetOid: "a".repeat(40) }],
    );
    expect(rows.map((r) => [r.name, r.existsLocal, r.existsRemote])).toEqual([
      ["v1.0.0", true, true],
      ["local", true, false],
    ]);
  });

  it("añade al final los que solo existen en el remoto, por versión descendente", () => {
    const rows = mergeTags(
      [tag("v1.0.0")],
      [
        { name: "v1.0.0", targetOid: "a".repeat(40) },
        { name: "v1.2.0", targetOid: "b".repeat(40) },
        { name: "v1.10.0", targetOid: "c".repeat(40) },
      ],
    );
    expect(rows.map((r) => r.name)).toEqual(["v1.0.0", "v1.10.0", "v1.2.0"]);
    expect(rows[1].existsLocal).toBe(false);
    expect(rows[1].existsRemote).toBe(true);
  });

  it("detecta un tag que apunta a otro commit en el remoto", () => {
    const rows = mergeTags([tag("v1.0.0")], [{ name: "v1.0.0", targetOid: "b".repeat(40) }]);
    expect(rows[0].divergent).toBe(true);
  });
});
