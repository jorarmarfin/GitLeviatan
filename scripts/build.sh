#!/usr/bin/env bash
# Compila la app (release). Por defecto genera solo el binario, sin paquetes.
#
# Uso: scripts/build.sh [--check] [--bundle] [--inno]
#   --check   ejecuta antes scripts/check.sh (lint, formato y tests)
#   --bundle  genera además los paquetes del sistema actual:
#               Linux   → .deb y AppImage
#               macOS   → .dmg
#               Windows → instalador NSIS (.exe), desde Git Bash
#   --inno    solo Windows (Git Bash): instalador con Inno Setup en vez de NSIS
#             (delega en scripts/build-windows.ps1)
. "$(dirname "$0")/_env.sh"

CHECK=0 BUNDLE=0 INNO=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    --bundle) BUNDLE=1 ;;
    --inno) INNO=1 ;;
    *) echo "Opción desconocida: $arg" >&2; echo "Uso: $0 [--check] [--bundle] [--inno]" >&2; exit 2 ;;
  esac
done

if [ "$CHECK" = 1 ]; then
  "$ROOT/scripts/check.sh"
fi

if [ "$INNO" = 1 ]; then
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) ;;
    *) echo "--inno solo está disponible en Windows." >&2; exit 2 ;;
  esac
  exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$ROOT/scripts/build-windows.ps1")"
fi

pnpm install --frozen-lockfile

if [ "$BUNDLE" = 0 ]; then
  pnpm tauri build --no-bundle
  echo "✅ Binario: $ROOT/src-tauri/target/release/gitleviatan"
  exit 0
fi

case "$(uname -s)" in
  Linux) bundles="deb,appimage" ;;
  Darwin) bundles="dmg" ;;
  MINGW* | MSYS* | CYGWIN*) bundles="nsis" ;;
  *) echo "Sistema no soportado: $(uname -s)" >&2; exit 1 ;;
esac

# Evita depender de FUSE al generar el AppImage.
export APPIMAGE_EXTRACT_AND_RUN=1
pnpm tauri build --bundles "$bundles"

echo "✅ Paquetes ($bundles):"
find "$ROOT/src-tauri/target/release/bundle" -type f \
  \( -name '*.deb' -o -name '*.AppImage' -o -name '*.dmg' -o -name '*-setup.exe' \) -print
