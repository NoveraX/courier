import { client, rethrowMessage } from "./client";
import type { ParsedSpec, SourceSummary } from "./types";

export async function fetchRegistrySources(): Promise<SourceSummary[]> {
  const data = await client.post<{ sources: SourceSummary[] }>("/api/apis/registry/list", {
    json: {},
  }).catch(rethrowMessage("Failed to list sources"));
  return data.sources;
}

export async function fetchRemoveSource(name: string): Promise<void> {
  await client.post("/api/apis/registry/remove", { json: { name } })
    .catch(rethrowMessage("Failed to remove source"));
}

export interface CheckUpdatesResult {
  changed: boolean;
  newSpec?: ParsedSpec;
  error?: string;
}

export async function fetchCheckUpdates(name: string): Promise<CheckUpdatesResult> {
  return client.post<CheckUpdatesResult>("/api/apis/registry/check-updates", {
    json: { name },
  }).catch(rethrowMessage("Failed to check updates"));
}

export async function fetchCheckAllUpdates(): Promise<Record<string, { changed: boolean; error?: string }>> {
  const data = await client.post<{ results: Record<string, { changed: boolean; error?: string }> }>(
    "/api/apis/registry/check-all",
    { json: {} },
  ).catch(rethrowMessage("Failed to check sources"));
  return data.results;
}
