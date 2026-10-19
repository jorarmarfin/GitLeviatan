/** Nombre de carpeta a partir de la URL: `…/proyecto.git` → `proyecto`. */
export function repoNameFromUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/[/\\]+$/, "")
    .replace(/\.git$/, "");
  const last = trimmed.split(/[/:\\]/).pop() ?? "";
  return last.trim() === "" ? "repositorio" : last.trim();
}

/** Carpeta exacta del nuevo repositorio dentro de la carpeta elegida. */
export function cloneDestination(parent: string, url: string): string {
  const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return `${parent.replace(/[/\\]+$/, "")}${separator}${repoNameFromUrl(url)}`;
}
