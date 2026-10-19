# SPEC 01 — Bootstrap del proyecto GitLeviatán

> **Estado:** Borrador
> **Depende de:** ninguna
> **Fecha:** 2026-10-19
> **Objetivo:** Dejar un repositorio GPL-3.0-or-later con Tauri 2 + React + TypeScript + Vite + Tailwind/shadcn, tema claro/oscuro, CI en Ubuntu y documentación base, de modo que la app arranque en Ubuntu con una ventana vacía.

## Por qué existe esta spec

`GITLEVIATAN_SPEC.md` describe el producto completo (Fases 0–6). Es demasiado grande para una sola spec. Esta cubre solo la Fase 0 y fija la base técnica (stack, estructura de carpetas, CI, licencia) sobre la que se apoyan las specs de Lectura, Grafo, Escritura y Remotos.

## Alcance

**Dentro:**

- Proyecto Tauri 2 con frontend React + TypeScript + Vite, gestionado con `pnpm`.
- Tailwind CSS y shadcn/ui inicializados.
- Tema claro y oscuro con toggle y opción "seguir al sistema". La preferencia se guarda en `localStorage`.
- Estructura de carpetas de la sección 9 de `GITLEVIATAN_SPEC.md`, con módulos vacíos (`.gitkeep` o `index.ts`/`mod.rs` mínimos).
- Un comando Tauri de prueba (`ping`) para validar el puente `invoke()` Rust ↔ React.
- Capabilities Tauri mínimas: sin shell, sin acceso a filesystem desde el frontend.
- Vitest + React Testing Library (frontend) y `cargo test` (Rust) con una prueba trivial cada uno.
- ESLint, Prettier, `rustfmt` y `clippy` configurados.
- GitHub Actions en Ubuntu: lint, tests y `tauri build`, sin generar paquetes.
- `LICENSE` (GPL-3.0-or-later) y `README.md` en español e inglés con requisitos de Ubuntu.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- `docs/architecture.md` y `docs/decisions/` con ADRs de stack y licencia.

**Fuera de alcance (para specs futuras):**

- Cualquier operación Git: abrir repo, status, historial, grafo, commits, ramas, remotos.
- Persistencia de preferencias en archivo de configuración (`storage/`); el tema usa `localStorage` por ahora.
- Empaquetado `.deb` o AppImage (Fase 5).
- Windows y macOS (Fase 6).
- Monaco, Zustand con stores reales y diseño visual del layout principal.
- Auditoría de dependencias en CI (`cargo audit`, `pnpm audit`).
- Localización de la interfaz.
- Prototipo visual y sistema de diseño definitivo.

## Modelo de datos

Esta spec no introduce estructuras de datos de dominio. Solo dos elementos mínimos:

```ts
// Preferencia de tema (localStorage, clave "gitleviatan:theme:v1")
type ThemePreference = "light" | "dark" | "system";
```

```rust
// Comando Tauri de prueba, src-tauri/src/commands/mod.rs
// #[tauri::command] fn ping() -> String  // devuelve "pong"
```

Convenciones:

- Identificador de la app: `dev.gitleviatan.app` (en `tauri.conf.json`).
- Las versiones exactas de dependencias se fijan en `pnpm-lock.yaml` y `Cargo.lock`, ambos versionados.

## Plan de implementación

1. Crear `.gitignore`, `LICENSE` (texto GPL-3.0) y `README.md` mínimo. Commit.
2. Inicializar Tauri 2 + Vite + React + TS con `pnpm` en la raíz. Verificación: `pnpm tauri dev` abre una ventana en Ubuntu.
3. Reorganizar `src/` en `app/`, `components/`, `features/{repositories,status,graph,commits,branches,diffs,sync}/`, `stores/`, `lib/`, `types/`. Verificación: la app sigue arrancando.
4. Reorganizar `src-tauri/src/` en `commands/`, `git/`, `storage/`, `lib.rs`. Verificación: `cargo check` pasa.
5. Añadir el comando `ping` y llamarlo desde `src/app/` al montar. Verificación: la UI muestra `pong`.
6. Reducir `capabilities/` de Tauri a lo mínimo necesario para `ping` y la ventana. Verificación: la app sigue funcionando sin permisos de shell ni fs.
7. Instalar Tailwind CSS y ejecutar `shadcn init`. Verificación: un `Button` de shadcn se ve estilizado.
8. Implementar tema claro/oscuro/sistema con toggle en `src/components/ThemeToggle.tsx` y persistencia en `localStorage` (clave `gitleviatan:theme:v1`). Verificación: cambia el tema y se conserva al reiniciar.
9. Configurar ESLint, Prettier, `rustfmt` y `clippy`, con scripts `pnpm lint` y `pnpm format`. Verificación: ambos pasan en limpio.
10. Configurar Vitest + React Testing Library con una prueba de `ThemeToggle`, y una prueba Rust para `ping`. Verificación: `pnpm test` y `cargo test` pasan.
11. Crear `.github/workflows/ci.yml` (Ubuntu: dependencias del sistema de Tauri, lint, tests, `pnpm tauri build --no-bundle`). Verificación: el workflow pasa en un push.
12. Completar `README.md` (es/en, requisitos: Git, Node, pnpm, Rust, librerías de sistema de Tauri en Ubuntu), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
13. Crear `docs/architecture.md` (diagrama de capas de la sección 5) y `docs/decisions/0001-stack.md`, `docs/decisions/0002-licencia.md`.

## Criterios de aceptación

- [ ] `pnpm install && pnpm tauri dev` abre una ventana en Ubuntu sin errores en consola.
- [ ] La ventana muestra el resultado de `ping` (`pong`) obtenido desde Rust vía `invoke()`.
- [ ] El toggle alterna entre claro, oscuro y sistema, y la elección se conserva tras reiniciar la app.
- [ ] Con "sistema", el tema cambia al cambiar la preferencia del sistema operativo.
- [ ] `pnpm lint`, `pnpm test`, `cargo fmt --check`, `cargo clippy -- -D warnings` y `cargo test` terminan con código 0.
- [ ] `pnpm tauri build --no-bundle` termina con código 0.
- [ ] El workflow `ci.yml` pasa en verde en un push a `main`.
- [ ] `src-tauri/capabilities/` no contiene permisos de `shell` ni de `fs`.
- [ ] Existen `LICENSE` (GPL-3.0), `README.md` (es/en), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `docs/architecture.md` y al menos dos ADRs en `docs/decisions/`.
- [ ] Existen los directorios `src/features/{repositories,status,graph,commits,branches,diffs,sync}` y `src-tauri/src/{commands,git,storage}`.
- [ ] `pnpm-lock.yaml` y `Cargo.lock` están versionados.
- [ ] La app no realiza ninguna petición de red al arrancar.

## Decisiones

- **Sí:** `pnpm`. Lockfile estricto, rápido y bien soportado por Tauri y GitHub Actions.
- **No:** `npm` y `bun`. `npm` es más lento; `bun` está menos probado con Tauri.
- **Sí:** GPL-3.0-or-later. Mantiene libres los derivados, coherente con el lema del producto.
- **No:** MIT. Permitiría forks cerrados; se prioriza protección sobre adopción.
- **Sí:** tema en `localStorage`. Evita construir `storage/` antes de que exista una spec de Preferencias.
- **No:** persistir el tema en archivo de configuración Rust. Se migrará en la spec de Preferencias.
- **Sí:** CI con lint + test + build en Ubuntu. Detecta regresiones temprano.
- **No:** auditoría de dependencias en CI. Va en una spec posterior para no inflar el bootstrap.
- **Sí:** `tauri build --no-bundle` en CI. Valida que compila sin pagar el coste del empaquetado.
- **No:** `.deb` ni AppImage ahora. El plan original los sitúa en la Fase 5.
- **Sí:** comando `ping` de prueba. Valida el puente Rust ↔ React antes de construir sobre él.
- **Sí:** toda la gobernanza (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY) y docs de arquitectura desde el inicio, a petición del usuario.
- **Sí:** dividir `GITLEVIATAN_SPEC.md` en una spec por fase. Esta cubre solo la Fase 0.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Faltan librerías de sistema de Tauri 2 en Ubuntu (`webkit2gtk-4.1`, etc.) | Listarlas en el README e instalarlas en el workflow de CI. |
| Cambios de API entre versiones menores de Tauri 2 o shadcn | Fijar versiones con lockfiles y registrar la decisión en `docs/decisions/0001-stack.md`. |
| Capabilities demasiado permisivas por defecto en la plantilla de Tauri | El paso 6 las reduce y un criterio de aceptación lo verifica. |
| `localStorage` no disponible o vaciado | El tema cae a "sistema" sin romper la UI. |
| Nombre y marca "GitLeviatán" sin validar | Pendiente en el documento original; no bloquea el bootstrap. |

## Lo que **no** está en esta spec

- Cualquier funcionalidad Git (abrir repos, status, historial, grafo, commits, ramas, fetch/pull/push, clone).
- Archivo de configuración y repositorios recientes.
- Empaquetado `.deb` / AppImage y soporte Windows/macOS.
- Auditoría de dependencias y pruebas E2E.
- Prototipo visual y sistema de diseño definitivo.

Cada uno entra, si llega, en su propia spec.
