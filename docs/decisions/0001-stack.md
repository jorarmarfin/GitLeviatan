# ADR 0001 — Stack tecnológico

**Estado:** Aceptada · **Fecha:** 2026-10-19

## Decisión

Tauri 2 + React + TypeScript + Vite, Tailwind CSS + shadcn/ui, `pnpm`, Rust para el backend local
y el ejecutable Git instalado (vía `std::process::Command`) como motor Git.

## Motivos

- Tauri: integración nativa y empaquetado multiplataforma ligero.
- Git CLI: fidelidad exacta al comportamiento de Git, sin reimplementar el motor.
- `pnpm`: lockfile estricto, rápido y bien soportado por Tauri y GitHub Actions.

## Alternativas descartadas

- Electron: mayor consumo de recursos.
- `npm` / `bun`: `npm` más lento; `bun` menos probado con Tauri.
- libgit2/gitoxide como motor: divergencias de comportamiento y más superficie.

## Nota

`typescript` se fija en 6.x porque `typescript-eslint` aún no soporta TS 7.
