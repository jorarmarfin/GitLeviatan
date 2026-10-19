import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { ping } from "@/lib/ping";

export function App() {
  const [pong, setPong] = useState<string>("…");

  useEffect(() => {
    ping()
      .then(setPong)
      .catch((error: unknown) => setPong(`error: ${String(error)}`));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">GitLeviatán</h1>
      <p className="text-muted-foreground">El poder de Git, bajo tu control.</p>
      <p data-testid="ping">ping: {pong}</p>
      <ThemeToggle />
    </main>
  );
}
