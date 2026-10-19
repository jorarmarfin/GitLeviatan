import { invoke } from "@tauri-apps/api/core";

export function ping(): Promise<string> {
  return invoke<string>("ping");
}
