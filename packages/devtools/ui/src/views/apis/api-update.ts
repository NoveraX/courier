import { client, rethrowMessage } from "./client";
import type { ParsedSpec, UpdateResult } from "./types";

export async function fetchUpdatePreview(name: string, newSpec: ParsedSpec): Promise<UpdateResult> {
  return client.post<UpdateResult>("/api/apis/update/preview", {
    json: { name, newSpec },
  }).catch(rethrowMessage("Failed to preview update"));
}

export async function fetchUpdateApply(
  name: string,
  newSpec: ParsedSpec,
  files: { path: string; content: string }[],
): Promise<{ written: number; deleted: number }> {
  return client.post<{ written: number; deleted: number }>("/api/apis/update/apply", {
    json: { name, newSpec, files },
  }).catch(rethrowMessage("Failed to apply update"));
}
