<p align="center"><img src="src/assets/logo.png" alt="Logo de GitLeviatán" width="160" /></p>

# GitLeviatán

**ES:** Cliente gráfico de Git, libre y local-first. _El poder de Git, bajo tu control._
**EN:** Free, local-first graphical Git client. _The power of Git, under your control._

Licencia / License: [GPL-3.0-or-later](LICENSE)

> Estado / Status: bootstrap (v0.1.0). Aún no hay funciones Git. / No Git features yet.

---

## Español

### Requisitos (Ubuntu)

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
```

### Privacidad

Local-first: sin cuentas, sin telemetría y sin backend propio. Git hooks y la configuración
de un repositorio pueden ejecutar comandos locales con tus permisos de usuario.

## English

### Requirements (Ubuntu)

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
```

### Privacy

Local-first: no accounts, no telemetry, no own backend. Git hooks and repository
configuration can run local commands with your user permissions.

## Documentación / Docs

- [Arquitectura](docs/architecture.md)
- [Decisiones (ADRs)](docs/decisions/)
- [Contribuir](CONTRIBUTING.md) · [Código de conducta](CODE_OF_CONDUCT.md) · [Seguridad](SECURITY.md)
