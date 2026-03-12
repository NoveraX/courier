/**
 * Helpers for registry routes: spec fetching, fingerprint collection, update checks.
 */

import { existsSync, readFileSync } from "node:fs";
import type { ParsedSpec } from "../codegen";
import {
  computeSpecHash,
  createSpecDigest,
  generateFingerprints,
  loadCache,
  loadDigestCache,
  parseSpec,
  saveCache,
  saveDigestCache,
  updateCachedDigest,
  updateCachedFingerprints,
} from "../codegen";
import type { RegistrySource } from "../codegen/registry/types";
import { resolveProjectSafe } from "../context";
import { isUrl } from "./fs-helpers";
import type { JsonResponse } from "./route-types";
import { validateSpecUrl } from "./validate-url";

export { errMsg, readFilesFromDisk, writeFileWithDirs } from "./fs-helpers";

/** Persist fingerprint and digest caches for a source in one call */
export function persistCaches(
  sourceName: string,
  fingerprints: Record<string, string>,
  spec: ParsedSpec,
): void {
  const cache = loadCache();
  saveCache(updateCachedFingerprints(cache, sourceName, fingerprints));

  const digestCache = loadDigestCache();
  saveDigestCache(updateCachedDigest(digestCache, sourceName, createSpecDigest(spec)));
}

export function collectFingerprints(
  files: { path: string; content: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of files) {
    Object.assign(result, generateFingerprints(file.content));
  }
  return result;
}

/**
 * Build fingerprints from disk when cache is missing.
 *
 * For endpoints in `userModified`, sets a dummy hash so they're
 * classified as "modified" during merge. For others, uses the
 * real disk hash so they're classified as "safe".
 */
export function buildFallbackFingerprints(
  existingFiles: Record<string, string>,
  userModified: string[],
): Record<string, string> {
  const fps: Record<string, string> = {};
  for (const content of Object.values(existingFiles)) {
    Object.assign(fps, generateFingerprints(content));
  }
  for (const name of userModified) {
    if (name in fps) fps[name] = "__user_modified__";
  }
  return fps;
}

/**
 * Detect which endpoints were user-modified by comparing
 * generated fingerprints against what's currently on disk.
 */
export function detectUserModified(
  generatedFingerprints: Record<string, string>,
  existingFiles: Record<string, string>,
): string[] {
  const diskFps: Record<string, string> = {};
  for (const content of Object.values(existingFiles)) {
    Object.assign(diskFps, generateFingerprints(content));
  }

  const modified: string[] = [];
  for (const [name, diskHash] of Object.entries(diskFps)) {
    const genHash = generatedFingerprints[name];
    if (genHash && genHash !== diskHash) modified.push(name);
  }
  return modified;
}

export async function fetchSpecRaw(specUrl: string, res: JsonResponse): Promise<string | null> {
  if (isUrl(specUrl)) {
    await validateSpecUrl(specUrl);
    const response = await fetch(specUrl);
    if (!response.ok) {
      res.status(502).json({ error: `Failed to fetch spec: ${response.status}` });
      return null;
    }
    return response.text();
  }

  const filePath = resolveProjectSafe(specUrl);
  if (!existsSync(filePath)) {
    res.status(400).json({ error: `Spec file not found: ${filePath}` });
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

export async function checkSingleSource(
  source: Pick<RegistrySource, "specUrl" | "specHash">,
): Promise<{ changed: boolean; error?: string }> {
  if (!source.specUrl) return { changed: false };

  try {
    const raw = isUrl(source.specUrl)
      ? await fetchRemoteSpec(source.specUrl)
      : readLocalSpec(source.specUrl);
    if (!raw) return { changed: false, error: "Failed to read spec" };
    const newSpec = parseSpec(raw);
    return { changed: computeSpecHash(newSpec) !== source.specHash };
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : "Check failed" };
  }
}

async function fetchRemoteSpec(specUrl: string): Promise<string | null> {
  await validateSpecUrl(specUrl);
  const response = await fetch(specUrl);
  return response.ok ? response.text() : null;
}

function readLocalSpec(specUrl: string): string | null {
  const filePath = resolveProjectSafe(specUrl);
  return existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
}
