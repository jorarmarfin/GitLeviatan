import { useCallback, useEffect, useState } from "react";
import { GitBranch } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RepositoryRef } from "@/types/git";

import { SwitchBranchDialog } from "./SwitchBranchDialog";
import type { BranchInfo } from "./types";
import { useBranches } from "./useBranches";

type Props = {
  repository: RepositoryRef;
  /** Sube cuando otra parte de la app cambió el repositorio. */
  externalVersion: number;
  /** Se llama tras cambiar de rama para refrescar grafo, estado y ramas. */
  onChanged: () => void;
};

const NOTICE_MS = 5000;

/** Botón con la rama actual que abre el selector de rama; confirma el resultado. */
export function BranchSwitcher({ repository, externalVersion, onChanged }: Props) {
  const { branches, loadError, busy, error, clearError, checkout } = useBranches(
    repository,
    externalVersion,
    onChanged,
  );
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const closeDialog = useCallback(() => {
    clearError();
    setOpen(false);
  }, [clearError]);

  async function select(branch: BranchInfo) {
    if (branch.isCurrent) {
      closeDialog();
      return;
    }
    if (await checkout(branch.name)) {
      setOpen(false);
      const local =
        branch.kind === "remote" ? branch.name.split("/").slice(1).join("/") : branch.name;
      setNotice(`Cambiaste a «${local}»`);
    }
  }

  const current = branches?.find((b) => b.kind === "local" && b.isCurrent) ?? null;
  const label = !branches ? "Ramas…" : current ? current.name : "HEAD desacoplado";

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!branches || loadError !== null}
        title="Cambiar de rama"
        aria-haspopup="dialog"
        onClick={() => {
          clearError();
          setOpen(true);
        }}
      >
        <GitBranch aria-hidden="true" />
        <span className="max-w-48 truncate">{label}</span>
      </Button>
      {notice && (
        <span role="status" className="text-xs text-muted-foreground">
          {notice}
        </span>
      )}
      {open && branches && (
        <SwitchBranchDialog
          branches={branches}
          busy={busy}
          error={error}
          onSelect={(branch) => void select(branch)}
          onClose={closeDialog}
        />
      )}
    </>
  );
}
