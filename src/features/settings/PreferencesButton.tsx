import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PreferencesButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="icon" variant="ghost" aria-label="Preferencias" onClick={onClick}>
      <Settings aria-hidden="true" />
    </Button>
  );
}
