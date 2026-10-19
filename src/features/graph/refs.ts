import type { RefLabel } from "./types";

/** Convierte las referencias de `git log --decorate=full` (`%D`) en etiquetas. */
export function parseRefs(refs: readonly string[]): RefLabel[] {
  const labels: RefLabel[] = [];
  for (const ref of refs) {
    if (ref === "HEAD") {
      labels.push({ name: "HEAD", kind: "head" });
    } else if (ref.startsWith("HEAD -> ")) {
      labels.push({ name: stripPrefix(ref.slice("HEAD -> ".length), "refs/heads/"), kind: "head" });
    } else if (ref.startsWith("tag: ")) {
      labels.push({ name: stripPrefix(ref.slice("tag: ".length), "refs/tags/"), kind: "tag" });
    } else if (ref.startsWith("refs/heads/")) {
      labels.push({ name: stripPrefix(ref, "refs/heads/"), kind: "local" });
    } else if (ref.startsWith("refs/remotes/")) {
      const name = stripPrefix(ref, "refs/remotes/");
      if (!name.endsWith("/HEAD")) labels.push({ name, kind: "remote" });
    }
  }
  return labels;
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
