#!/usr/bin/env bash
# Entorno común: raíz del repo, rustup y comprobación de herramientas.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

for tool in pnpm cargo git; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Falta '$tool' en el PATH." >&2; exit 1; }
done
