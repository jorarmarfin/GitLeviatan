# ADR 0003 — Auditoría de dependencias y licencias

**Estado:** Aceptada · **Fecha:** 2026-10-19

## Decisión

El CI (job `audit`, también semanal) ejecuta:

- `pnpm audit --audit-level=high`: falla ante vulnerabilidades **altas o críticas** de npm.
- `cargo audit`: falla ante cualquier vulnerabilidad de RustSec. Los avisos de crates _unmaintained_
  o _yanked_ solo avisan (Tauri arrastra bindings de GTK3 sin mantenimiento en Linux).
- `cargo deny check`: licencias (`src-tauri/deny.toml`), fuentes de crates y avisos.
- `pnpm licenses:check` (`scripts/check-licenses.mjs`): licencias de npm.

## Licencias

El proyecto es GPL-3.0-or-later (ADR 0002). Se admiten licencias permisivas y de copyleft débil
compatibles con GPLv3: MIT, Apache-2.0, BSD, ISC, MPL-2.0, Zlib, Unicode, CC0, BlueOak, 0BSD.
Quedan fuera GPL-2.0-only, AGPL, licencias propietarias y paquetes sin licencia.

Excepciones **solo para herramientas de desarrollo** que no se distribuyen:

| Paquete           | Licencia     | Motivo                                                                                     |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `argparse`        | PSF-2.0      | Dependencia transitiva de las herramientas de prueba; compatible con GPL.                  |
| `spdx-exceptions` | CC-BY-3.0    | Solo datos (lista de excepciones SPDX).                                                    |
| `css-value`       | sin declarar | Dependencia transitiva de WebdriverIO (E2E). Sin licencia en el paquete; no se distribuye. |

Las dependencias de producción no admiten excepciones.

## Cómo añadir una excepción de seguridad

1. Identifica el aviso concreto (`RUSTSEC-AAAA-NNNN` o el id de GHSA).
2. Añádelo a `ignore` en `src-tauri/deny.toml` (y a `.cargo/audit.toml` si usa `cargo audit`) con un comentario.
3. Registra aquí el aviso, por qué no aplica o no es explotable en esta app, y cuándo se revisará.

Sin ese registro el PR no se acepta. No hay excepciones vigentes.
