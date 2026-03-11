/**
 * Helpers for registry routes: spec fetching, fingerprint collection, update checks.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SpecSource } from "../codegen/index.js";
import { generateFingerprints, hasSpecChanged, parseSpec } from "../codegen/index.js";
import type { RegistrySource } from "../codegen/merge/types.js";
import type { JsonResponse } from "./route-types.js";

export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function collectFingerprints(
  files: { path: string; content: string }[],
): Record<string, { hash: string; userModified: boolean }> {
  const result: Record<string, { hash: string; userModified: boolean }> = {};
  for (const file of files) {
    Object.assign(result, generateFingerprints(file.content));
  }
  return result;
}

export async function fetchSpecRaw(
  specSource: SpecSource,
  res: JsonResponse,
): Promise<string | null> {
  if (specSource.type === "url") {
    const response = await fetch(specSource.value);
    if (!response.ok) {
      res.status(502).json({ error: `Failed to fetch spec: ${response.status}` });
      return null;
    }
    return response.text();
  }

  if (specSource.type === "file") {
    const filePath = resolve(specSource.value);
    if (!existsSync(filePath)) {
      res.status(400).json({ error: `Spec file not found: ${filePath}` });
      return null;
    }
    return readFileSync(filePath, "utf-8");
  }

  res.status(400).json({ error: "Cannot check updates for raw/paste sources" });
  return null;
}

export async function checkSingleSource(
  source: Pick<RegistrySource, "specSource" | "specHash">,
): Promise<{ changed: boolean; error?: string }> {
  try {
    const response = await fetch(source.specSource.value);
    if (!response.ok) return { changed: false, error: `HTTP ${response.status}` };

    const raw = await response.text();
    const newSpec = parseSpec(raw);
    return { changed: hasSpecChanged(source as RegistrySource, newSpec) };
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : "Fetch failed" };
  }
}
