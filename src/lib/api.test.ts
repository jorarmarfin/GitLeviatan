import { describe, expect, it } from "vitest";

import { errorDetail, errorMessage, toAppError } from "@/lib/api";

describe("toAppError", () => {
  it("conserva un AppError del backend", () => {
    const error = { kind: "network", message: "Sin conexión", detail: "fatal: unable to access" };
    expect(toAppError(error)).toEqual(error);
  });

  it("acepta cada tipo de error definido", () => {
    for (const kind of [
      "git",
      "auth",
      "network",
      "validation",
      "io",
      "notFound",
      "cancelled",
      "internal",
    ]) {
      expect(toAppError({ kind, message: "m", detail: null }).kind).toBe(kind);
    }
  });

  it("un kind desconocido pasa a internal sin perder el mensaje", () => {
    expect(toAppError({ kind: "inventado", message: "algo", detail: null })).toEqual({
      kind: "internal",
      message: "algo",
      detail: null,
    });
  });

  it("convierte un string (error de Tauri) en un AppError legible", () => {
    expect(toAppError("command fetch not found")).toEqual({
      kind: "internal",
      message: "command fetch not found",
      detail: null,
    });
  });

  it("cualquier otra cosa da un mensaje genérico", () => {
    expect(toAppError(undefined).message).toBe("Error desconocido");
    expect(errorMessage(42)).toBe("Error desconocido");
    expect(errorDetail(null)).toBeNull();
  });

  it("ignora un detalle vacío", () => {
    expect(toAppError({ kind: "git", message: "m", detail: "  " }).detail).toBeNull();
  });
});
