<p align="center"><img src="src/assets/logo.png" alt="Logo de GitLeviatán" width="160" /></p>

# GitLeviatán

**ES:** Cliente gráfico de Git, libre y local-first. _El poder de Git, bajo tu control._
**EN:** Free, local-first graphical Git client. _The power of Git, under your control._

Licencia / License: [GPL-3.0-or-later](LICENSE)

> Estado / Status: v0.2.0: Ubuntu verificado; Windows y macOS compilan y pasan los tests en CI, verificación manual pendiente. / v0.2.0: Ubuntu verified; Windows and macOS build and pass tests in CI, manual verification pending.
> Ver el [CHANGELOG](CHANGELOG.md). / See the [CHANGELOG](CHANGELOG.md).

---

## Español

### Instalación (Ubuntu)

Descarga el paquete de la [última release](../../releases/latest):

```bash
sudo apt install ./GitLeviatan_*_amd64.deb      # .deb: instala también Git y las librerías necesarias
# o, sin instalar:
chmod +x GitLeviatan_*.AppImage && ./GitLeviatan_*.AppImage
```

**Dependencias del paquete Linux.** Versión mínima probada: Ubuntu 22.04 (glibc 2.35).

| Paquete                             | Para qué                              | Lo instala el `.deb` | Con el AppImage |
| ----------------------------------- | ------------------------------------- | :------------------: | :-------------: |
| `git`                               | Todas las operaciones del repositorio |          Sí          |  Instálalo tú   |
| `libwebkit2gtk-4.1-0`, `libgtk-3-0` | Ventana y renderizado (WebKitGTK)     |          Sí          |  Instálalos tú  |
| `ssh-agent` / credential helper     | Autenticación con remotos (opcional)  |          No          |       No        |

Si Git no está instalado, la app lo indica al arrancar. Si el AppImage no abre, comprueba
`sudo apt install libwebkit2gtk-4.1-0 libfuse2`.

### Instalación en Windows y macOS

| Plataforma | Paquete                  | Requisitos                                                                                       |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Windows    | Instalador `.exe` (NSIS) | Windows 10+ y [Git for Windows](https://git-scm.com/download/win). WebView2 se instala si falta. |
| macOS      | `.dmg` universal         | macOS 10.15+ y Git (`brew install git` o `xcode-select --install`).                              |

La app busca Git en las Preferencias, luego en el `PATH` y luego en sitios habituales (Git for Windows, Homebrew).
La autenticación usa lo que ya tengas configurado: `ssh-agent`/OpenSSH y Git Credential Manager en Windows;
`ssh-agent` y Keychain (`osxkeychain`) en macOS.

> ⚠️ **Los instaladores de Windows y macOS no están firmados.** Es una limitación conocida: firmar y notarizar
> requiere certificados de pago.
>
> - **Windows (SmartScreen):** «Windows protegió su PC» → _Más información_ → _Ejecutar de todas formas_.
> - **macOS (Gatekeeper):** clic derecho sobre la app → _Abrir_. Si macOS dice que está dañada:
>   `xattr -dr com.apple.quarantine /Applications/GitLeviatan.app`.
>
> Comprueba la integridad con `SHA256SUMS.txt` de la release. Más detalles y limitaciones en
> [docs/platforms.md](docs/platforms.md).

### Requisitos para desarrollar (Ubuntu)

- Git
- Node.js 24+ y [pnpm](https://pnpm.io) 10+
- Rust estable (vía [rustup](https://rustup.rs))
- Librerías de sistema de Tauri 2:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### Desarrollo

```bash
pnpm install
pnpm tauri dev          # app de escritorio con recarga en caliente
pnpm lint && pnpm test  # frontend
cargo test --manifest-path src-tauri/Cargo.toml  # Rust
pnpm tauri build --no-bundle                     # compila sin empaquetar
pnpm tauri build                                 # genera .deb y AppImage en src-tauri/target/release/bundle/
scripts/build.sh --bundle                        # igual, y detecta el SO (Linux: deb+AppImage · macOS: dmg · Windows/Git Bash: NSIS)
pnpm e2e                                         # E2E (ver docs/e2e.md)
```

### Privacidad

Local-first: sin cuentas, sin telemetría y sin backend propio. Git hooks y la configuración
de un repositorio pueden ejecutar comandos locales con tus permisos de usuario.

## English

### Installation (Ubuntu)

Download the package from the [latest release](../../releases/latest):

```bash
sudo apt install ./GitLeviatan_*_amd64.deb      # .deb: also installs Git and the required libraries
# or, without installing:
chmod +x GitLeviatan_*.AppImage && ./GitLeviatan_*.AppImage
```

**Linux package dependencies.** Minimum tested version: Ubuntu 22.04 (glibc 2.35). The `.deb` pulls in `git`,
`libwebkit2gtk-4.1-0` and `libgtk-3-0`; with the AppImage you install them yourself (plus `libfuse2` if it does
not start). An SSH agent or Git credential helper is only needed for authenticated remotes.

### Installation on Windows and macOS

| Platform | Package                 | Requirements                                                                                           |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Windows  | `.exe` installer (NSIS) | Windows 10+ and [Git for Windows](https://git-scm.com/download/win). WebView2 is installed if missing. |
| macOS    | universal `.dmg`        | macOS 10.15+ and Git (`brew install git` or `xcode-select --install`).                                 |

The app looks for Git in Preferences, then in `PATH`, then in common locations (Git for Windows, Homebrew).
Authentication uses what you already have configured: `ssh-agent`/OpenSSH and Git Credential Manager on Windows;
`ssh-agent` and Keychain (`osxkeychain`) on macOS.

> ⚠️ **The Windows and macOS installers are not signed.** Known limitation: signing and notarizing needs paid
> certificates.
>
> - **Windows (SmartScreen):** "Windows protected your PC" → _More info_ → _Run anyway_.
> - **macOS (Gatekeeper):** right-click the app → _Open_. If macOS says it is damaged:
>   `xattr -dr com.apple.quarantine /Applications/GitLeviatan.app`.
>
> Verify integrity with the release's `SHA256SUMS.txt`. More details and limitations in
> [docs/platforms.md](docs/platforms.md).

### Development requirements (Ubuntu)

- Git
- Node.js 24+ and [pnpm](https://pnpm.io) 10+
- Stable Rust (via [rustup](https://rustup.rs))
- Tauri 2 system libraries (see the `apt` command above)

### Development

```bash
pnpm install
pnpm tauri dev          # desktop app with hot reload
pnpm lint && pnpm test  # frontend
cargo test --manifest-path src-tauri/Cargo.toml  # Rust
pnpm tauri build --no-bundle                     # build without packaging
pnpm tauri build                                 # .deb and AppImage in src-tauri/target/release/bundle/
scripts/build.sh --bundle                        # same, picks the OS (Linux: deb+AppImage · macOS: dmg · Windows/Git Bash: NSIS)
pnpm e2e                                         # E2E (see docs/e2e.md)
```

### Privacy

Local-first: no accounts, no telemetry, no own backend. Git hooks and repository
configuration can run local commands with your user permissions.

## Documentación / Docs

- [Arquitectura](docs/architecture.md) · [Atajos de teclado](docs/shortcuts.md) · [Rendimiento](docs/performance.md) · [E2E](docs/e2e.md) · [Plataformas](docs/platforms.md)
- [Changelog](CHANGELOG.md)
- [Decisiones (ADRs)](docs/decisions/)
- [Contribuir](CONTRIBUTING.md) · [Código de conducta](CODE_OF_CONDUCT.md) · [Seguridad](SECURITY.md)
