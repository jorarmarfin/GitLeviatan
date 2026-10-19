<p align="center"><img src="src/assets/logo.png" alt="Logo de GitLeviatán" width="160" /></p>

# GitLeviatán

**ES:** Cliente gráfico de Git, libre y local-first. _El poder de Git, bajo tu control._
**EN:** Free, local-first graphical Git client. _The power of Git, under your control._

Licencia / License: [GPL-3.0-or-later](LICENSE)

> Estado / Status: release candidata del MVP para Ubuntu (v0.1.0). / MVP release candidate for Ubuntu (v0.1.0).
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
pnpm e2e                                         # E2E (see docs/e2e.md)
```

### Privacy

Local-first: no accounts, no telemetry, no own backend. Git hooks and repository
configuration can run local commands with your user permissions.

## Documentación / Docs

- [Arquitectura](docs/architecture.md) · [Atajos de teclado](docs/shortcuts.md) · [Rendimiento](docs/performance.md) · [E2E](docs/e2e.md)
- [Changelog](CHANGELOG.md)
- [Decisiones (ADRs)](docs/decisions/)
- [Contribuir](CONTRIBUTING.md) · [Código de conducta](CODE_OF_CONDUCT.md) · [Seguridad](SECURITY.md)
