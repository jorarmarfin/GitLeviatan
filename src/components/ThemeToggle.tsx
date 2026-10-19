import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, storeTheme } from "@/lib/theme";
import type { ThemePreference } from "@/types/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function select(next: ThemePreference) {
    storeTheme(next);
    setTheme(next);
  }

  return (
    <div role="group" aria-label="Tema" className="inline-flex gap-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={theme === value ? "default" : "outline"}
          size="sm"
          aria-pressed={theme === value}
          onClick={() => select(value)}
        >
          <Icon aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  );
}
