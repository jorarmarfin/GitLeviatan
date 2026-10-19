import { describe, expect, it } from "vitest";

import { parseRefs } from "./refs";

describe("parseRefs", () => {
  it("distingue HEAD, ramas locales, remotas y tags", () => {
    expect(
      parseRefs([
        "HEAD -> refs/heads/main",
        "refs/remotes/origin/main",
        "refs/heads/feature/login",
        "tag: refs/tags/v1.0",
      ]),
    ).toEqual([
      { name: "main", kind: "head" },
      { name: "origin/main", kind: "remote" },
      { name: "feature/login", kind: "local" },
      { name: "v1.0", kind: "tag" },
    ]);
  });

  it("una rama local con barra no se confunde con una remota", () => {
    expect(parseRefs(["refs/heads/origin/x"])).toEqual([{ name: "origin/x", kind: "local" }]);
  });

  it("representa HEAD desacoplado y oculta origin/HEAD", () => {
    expect(parseRefs(["HEAD", "refs/remotes/origin/HEAD"])).toEqual([
      { name: "HEAD", kind: "head" },
    ]);
  });
});
