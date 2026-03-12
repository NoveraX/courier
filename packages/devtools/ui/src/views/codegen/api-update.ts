import type { ParsedSpec, UpdateResult } from "./types";
import { API_BASE } from "./api";

export async function fetchUpdatePreview(name: string, newSpec: ParsedSpec): Promise<UpdateResult> {
  const res = await fetch(`${API_BASE}/api/codegen/update/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, newSpec }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to preview update");
  return data as UpdateResult;
}

export async function fetchUpdateApply(
  name: string,
  newSpec: ParsedSpec,
  files: { path: string; content: string }[],
): Promise<{ written: number; deleted: number }> {
  const res = await fetch(`${API_BASE}/api/codegen/update/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, newSpec, files }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to apply update");
  return data as { written: number; deleted: number };
}
