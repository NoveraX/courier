/**
 * Spec fetching and single-source update checking helpers.
 */

import { existsSync, readFileSync } from "node:fs";
import { createFetch } from "@noverax/nexus/fetch";
import { computeSpecHash, parseSpec } from "../apis";
import type { RegistrySource } from "../apis/registry/types";
import { resolveProjectSafe } from "../context";
import { isUrl } from "./fs-helpers";
import type { JsonResponse } from "./route-types";
import { validateSpecUrl } from "./validate-url";

const specClient = createFetch();

export async function fetchSpecRaw(specUrl: string, res: JsonResponse): Promise<string | null> {
  if (isUrl(specUrl)) {
    await validateSpecUrl(specUrl);
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
  source: Pick<RegistrySource, "specUrl" | "importType" | "specHash">,
): Promise<{ changed: boolean; error?: string }> {
  if (source.importType !== "url" || !source.specUrl) return { changed: false };

  try {
    const raw = await fetchRemoteSpec(source.specUrl);
    if (!raw) return { changed: false, error: "Failed to fetch spec" };
    const newSpec = parseSpec(raw);
    return { changed: computeSpecHash(newSpec) !== source.specHash };
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : "Check failed" };
  }
}

async function fetchRemoteSpec(specUrl: string): Promise<string | null> {
  await validateSpecUrl(specUrl);
  try {
    return await specClient.get<string>(specUrl, { responseType: "text" });
  } catch {
    return null;
  }
}
