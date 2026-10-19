# Contribuir a GitLeviatán

¡Gracias por tu interés! / Thanks for your interest!

## Flujo

1. Abre un issue antes de cambios grandes. Etiquetas: `good first issue`, `bug`, `enhancement`.
2. Trabaja en una rama y abre un pull request; todo PR se revisa.
3. El proyecto sigue desarrollo guiado por specs: ver la carpeta `specs/`.

## Antes de enviar un PR

```bash
pnpm lint && pnpm format:check && pnpm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm licenses:check && pnpm audit:js                  # dependencias (CI además ejecuta cargo audit/deny)
```

## Reglas

- Nunca concatenes entrada del usuario en comandos de shell; usa argumentos estructurados.
- No añadas telemetría ni envíes código a terceros.
- No copies recursos, logotipos ni código propietario de otros clientes Git.
- Al contribuir aceptas que tu aporte se licencia bajo GPL-3.0-or-later.
