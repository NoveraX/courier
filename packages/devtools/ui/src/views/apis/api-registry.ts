import type { ParsedSpec, SourceSummary } from "./types";
import { API_BASE } from "./api";

export async function fetchRegistrySources(): Promise<SourceSummary[]> {
  const res = await fetch(`${API_BASE}/api/apis/registry/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to list sources");
  return data.sources as SourceSummary[];
}

export async function fetchRemoveSource(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/apis/registry/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to remove source");
  }
}

export interface CheckUpdatesResult {
  changed: boolean;
  newSpec?: ParsedSpec;
  error?: string;
}

export async function fetchCheckUpdates(name: string): Promise<CheckUpdatesResult> {
  const res = await fetch(`${API_BASE}/api/apis/registry/check-updates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to check updates");
  return data as CheckUpdatesResult;
}

export async function fetchCheckAllUpdates(): Promise<Record<string, { changed: boolean; error?: string }>> {
  const res = await fetch(`${API_BASE}/api/apis/registry/check-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to check sources");
  return data.results as Record<string, { changed: boolean; error?: string }>;
}
