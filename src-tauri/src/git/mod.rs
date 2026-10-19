//! Servicio Git: procesos, parseo y operaciones de alto nivel.

pub mod error;
pub mod operations;
pub mod parse;
pub mod process;
pub mod repository;
pub mod types;

#[cfg(test)]
mod testutil;
