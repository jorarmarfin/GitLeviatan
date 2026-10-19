#!/usr/bin/env bash
# Lint, formato y tests de frontend y Rust (los mismos pasos que el CI).
. "$(dirname "$0")/_env.sh"

echo "==> Dependencias"
pnpm install --frozen-lockfile

echo "==> Frontend: lint, formato, tests"
pnpm lint
pnpm format:check
pnpm test

echo "==> Rust: fmt, clippy, tests"
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

echo "✅ Todo en orden"
