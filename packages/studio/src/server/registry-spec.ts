/**
 * Spec fetching and single-import update checking helpers.
 */

import { existsSync, readFileSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import type { CourierImportEntry } from "@noverax/courier/config";
import { computeSpecHash, parseSpec } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { resolveProjectSafe } from "../context";
import { allowedSpecHosts } from "./allowed-spec-hosts";
import { fetchSpec } from "./fetch-spec";
import { isUrl } from "./fs-helpers";
import type { JsonResponse } from "./route-types";
import { SpecFetchError } from "./spec-fetch-error";

const log = createLogger("Studio");

export async function fetchSpecRaw(specUrl: string, res: JsonResponse): Promise<string | null> {
  if (isUrl(specUrl)) {
    try {
      return await fetchSpec(specUrl, await allowedSpecHosts());
    } catch (err) {
      log.warn(`Studio could not fetch the spec from ${specUrl}`, err);
      const refused = err instanceof SpecFetchError && err.refused;
      const reason = err instanceof Error ? err.message : String(err);
      res
        .status(refused ? 400 : 502)
        .json({ error: `Failed to fetch spec from ${specUrl}: ${reason}` });
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
    const raw = await fetchSpec(specUrl, await allowedSpecHosts());
    const newSpec = parseSpec(raw);
    return { changed: computeSpecHash(newSpec) !== state?.specHash };
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : "Check failed" };
  }
}
