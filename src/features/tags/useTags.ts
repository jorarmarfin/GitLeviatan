import { useEffect, useState } from "react";

import { api, toAppError } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

import type { TagInfo } from "./types";

/** Tags locales del repositorio; se vuelven a leer cuando sube `externalVersion`. */
export function useTags(repository: RepositoryRef, externalVersion: number) {
  const [tags, setTags] = useState<TagInfo[] | null>(null);
  const [loadError, setLoadError] = useState<AppError | null>(null);

  useEffect(() => {
    let current = true;
    api
      .listTags(repository.id)
      .then((next) => {
        if (!current) return;
        setTags(next);
        setLoadError(null);
      })
      .catch((e: unknown) => current && setLoadError(toAppError(e)));
    return () => {
      current = false;
    };
  }, [repository.id, externalVersion]);

  return { tags, loadError };
}
