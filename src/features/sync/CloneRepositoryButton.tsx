import { useState } from "react";
import { GitFork } from "lucide-react";

import { Button } from "@/components/ui/button";

import { CloneDialog } from "./CloneDialog";

export function CloneRepositoryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <GitFork aria-hidden="true" />
        Clonar
      </Button>
      {open && <CloneDialog onClose={() => setOpen(false)} />}
    </>
  );
}
