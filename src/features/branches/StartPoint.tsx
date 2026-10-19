import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { TagInfo } from "@/features/tags/types";

import type { BranchInfo } from "./types";

export type StartKind = "head" | "commit" | "branch" | "tag" | "ref";

/** Origen elegido para una rama o un tag. `value` es el nombre o la expresión según `kind`. */
export type StartChoice = { kind: StartKind; value: string };

export const HEAD_START: StartChoice = { kind: "head", value: "" };

/**
 * Oid (o expresión) a pasar al backend, o `null` para HEAD. Las ramas, tags y expresiones se
 * validan con `resolve_ref`, que falla con un mensaje claro si no existen.
 */
export async function resolveStart(
  repositoryId: string,
  choice: StartChoice,
  selectedOid: string | null,
): Promise<string | null> {
  switch (choice.kind) {
    case "head":
      return null;
    case "commit":
      return selectedOid;
    case "branch":
    case "tag":
    case "ref":
      return api.resolveRef(repositoryId, choice.value);
  }
}

/** True si el origen está completo (los de nombre o expresión necesitan un valor). */
export function startIsComplete(choice: StartChoice): boolean {
  return choice.kind === "head" || choice.kind === "commit" || choice.value.trim() !== "";
}

/** Ramas y tags del repositorio para los selectores. Si fallan, las listas quedan vacías. */
export function useStartOptions(repositoryId: string) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  useEffect(() => {
    let current = true;
    api
      .listBranches(repositoryId)
      .then((next) => current && setBranches(next))
      .catch(() => undefined);
    api
      .listTags(repositoryId)
      .then((next) => current && setTags(next))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [repositoryId]);
  return { branches, tags };
}

type Props = {
  /** Distingue los grupos de radios si hay varios en pantalla. */
  name: string;
  legend: string;
  choice: StartChoice;
  onChange: (choice: StartChoice) => void;
  selectedOid: string | null;
  branches: BranchInfo[];
  tags: TagInfo[];
};

const FIELD = "rounded-md border border-input bg-background px-2 py-1 text-sm";

/** Selector del punto de partida: HEAD, commit seleccionado, rama, tag o expresión libre. */
export function StartPoint({ name, legend, choice, onChange, selectedOid, branches, tags }: Props) {
  function radio(kind: StartKind, label: string, value = "") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={choice.kind === kind}
          onChange={() => onChange({ kind, value })}
        />
        {label}
      </label>
    );
  }

  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1">{legend}</legend>
      {radio("head", "Desde HEAD")}
      {selectedOid && radio("commit", `Desde el commit seleccionado (${selectedOid.slice(0, 7)})`)}
      {radio("branch", "Desde una rama", branches[0]?.name ?? "")}
      {choice.kind === "branch" && (
        <select
          aria-label="Rama de origen"
          value={choice.value}
          onChange={(event) => onChange({ kind: "branch", value: event.target.value })}
          className={FIELD}
        >
          {branches.map((branch) => (
            <option key={`${branch.kind}:${branch.name}`} value={branch.name}>
              {branch.name}
              {branch.kind === "remote" ? " (remota)" : ""}
            </option>
          ))}
        </select>
      )}
      {radio("tag", "Desde un tag", tags[0]?.name ?? "")}
      {choice.kind === "tag" &&
        (tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">Este repositorio no tiene tags.</p>
        ) : (
          <select
            aria-label="Tag de origen"
            value={choice.value}
            onChange={(event) => onChange({ kind: "tag", value: event.target.value })}
            className={FIELD}
          >
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        ))}
      {radio("ref", "Desde otra referencia")}
      {choice.kind === "ref" && (
        <input
          aria-label="Referencia de origen"
          placeholder="oid, HEAD~3…"
          value={choice.value}
          onChange={(event) => onChange({ kind: "ref", value: event.target.value })}
          className={`${FIELD} font-mono`}
        />
      )}
    </fieldset>
  );
}
