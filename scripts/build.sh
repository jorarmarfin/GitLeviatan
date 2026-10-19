#!/usr/bin/env bash
# Compila la app (release) sin generar paquetes.
# Uso: scripts/build.sh [--check]   (--check ejecuta antes scripts/check.sh)
. "$(dirname "$0")/_env.sh"

if [ "${1:-}" = "--check" ]; then
  "$ROOT/scripts/check.sh"
fi

pnpm install --frozen-lockfile
pnpm tauri build --no-bundle

echo "✅ Binario: $ROOT/src-tauri/target/release/gitleviatan"
