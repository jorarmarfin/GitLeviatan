//! Frontera pública de Tauri: cada comando expuesto al frontend vive aquí.

/// Comando de prueba para validar el puente `invoke()` Rust ↔ React.
#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong() {
        assert_eq!(ping(), "pong");
    }
}
