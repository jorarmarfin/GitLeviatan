import type { RemoteTag, TagInfo } from "./types";

/** Tag de la lista con lo que se sabe del remoto. */
export type TagRow = TagInfo & {
  /** Existe en local y en el remoto, pero apuntando a commits distintos. */
  divergent: boolean;
};

const byVersionDesc = (a: string, b: string) =>
  b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });

/**
 * Cruza los tags locales con los del remoto. Con `remote === null` (aún no consultado) los
 * locales quedan con `existsRemote: null`. Los que solo existen en el remoto van al final.
 */
export function mergeTags(local: TagInfo[], remote: RemoteTag[] | null): TagRow[] {
  if (remote === null) {
    return local.map((tag) => ({ ...tag, existsRemote: null, divergent: false }));
  }
  const remoteByName = new Map(remote.map((tag) => [tag.name, tag]));
  const localNames = new Set(local.map((tag) => tag.name));
  const rows: TagRow[] = local.map((tag) => {
    const onRemote = remoteByName.get(tag.name);
    return {
      ...tag,
      existsRemote: onRemote !== undefined,
      divergent: onRemote !== undefined && onRemote.targetOid !== tag.targetOid,
    };
  });
  const remoteOnly = remote
    .filter((tag) => !localNames.has(tag.name))
    .sort((a, b) => byVersionDesc(a.name, b.name))
    .map((tag): TagRow => ({
      name: tag.name,
      kind: "lightweight",
      targetOid: tag.targetOid,
      tagOid: null,
      message: null,
      taggerDate: null,
      existsLocal: false,
      existsRemote: true,
      divergent: false,
    }));
  return [...rows, ...remoteOnly];
}
