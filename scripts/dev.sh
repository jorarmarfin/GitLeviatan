#!/usr/bin/env bash
# App de escritorio con recarga en caliente.
. "$(dirname "$0")/_env.sh"

pnpm install --frozen-lockfile
exec pnpm tauri dev
