/**
 * Spec fetching and single-import update checking helpers.
 */

import { existsSync, readFileSync } from "node:fs";
import type { CourierImportEntry } from "@noverax/courier/config";
import { createFetch } from "@noverax/courier/fetch";
import { computeSpecHash, parseSpec } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { resolveProjectSafe } from "../context";
import { allowedSpecHosts } from "./allowed-spec-hosts";
import { isUrl } from "./fs-helpers";
import type { JsonResponse } from "./route-types";
import { validateSpecUrl } from "./validate-url";

const specClient = createFetch();

export async function fetchSpecRaw(specUrl: string, res: JsonResponse): Promise<string | null> {
  if (isUrl(specUrl)) {
    await validateSpecUrl(specUrl, await allowedSpecHosts());
    try {
      return await specClient.get<string>(specUrl, { responseType: "text" });
    } catch {
      res.status(502).json({ error: `Failed to fetch spec from ${specUrl}` });
      return null;
    }
  }

  const filePath = resolveProjectSafe(specUrl);
  if (!existsSync(filePath)) {
    res.status(400).json({ error: `Spec file not found: ${filePath}` });
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

export async function checkSingleSource(
  entry: CourierImportEntry,
  state: ImportStateEntry | undefined,
): Promise<{ changed: boolean; error?: string }> {
  if (entry.importType !== "url") return { changed: false };
  const specUrl = entry.from;
  if (!specUrl) return { changed: false };

  try {
    const raw = await fetchRemoteSpec(specUrl);
    if (!raw) return { changed: false, error: "Failed to fetch spec" };
    const newSpec = parseSpec(raw);
    return { changed: computeSpecHash(newSpec) !== state?.specHash };
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : "Check failed" };
  }
}

async function fetchRemoteSpec(specUrl: string): Promise<string | null> {
  await validateSpecUrl(specUrl, await allowedSpecHosts());
  try {
    return await specClient.get<string>(specUrl, { responseType: "text" });
  } catch {
    return null;
  }
}
