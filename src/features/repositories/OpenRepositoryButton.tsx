import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { useRepositoryStore } from "@/stores/repository";

export function OpenRepositoryButton() {
  const opening = useRepositoryStore((s) => s.opening);
  const openRepository = useRepositoryStore((s) => s.openRepository);

  async function pick() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") await openRepository(selected);
  }

  return (
    <Button onClick={pick} disabled={opening} size="sm">
      <FolderOpen aria-hidden="true" />
      {opening ? "Abriendo…" : "Abrir repositorio"}
    </Button>
  );
}
