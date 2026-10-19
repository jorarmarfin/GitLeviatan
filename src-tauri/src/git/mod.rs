//! Servicio Git: procesos, parseo y operaciones de alto nivel.

pub mod branches;
pub mod diff;
pub mod error;
pub mod operations;
pub mod parse;
pub mod process;
pub mod repository;
pub mod types;
pub mod write;

#[cfg(test)]
mod testutil;
