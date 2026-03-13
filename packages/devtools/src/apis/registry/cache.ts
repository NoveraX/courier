/**
 * Local caches stored in `.nexus/` directory (gitignored):
 * - `cache.json` — endpoint fingerprint hashes for user-modification detection
 * - `digests.json` — compact spec snapshots for API-level diffing
 *
 * Both files are minified JSON for compact storage.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveProject } from "../../context";

import type { SpecDigest } from "../merge/types";

/** Source name → (endpoint name → code hash) */
export interface FingerprintCache {
  [sourceName: string]: Record<string, string>;
}

/** Source name → lightweight spec snapshot */
export interface DigestCache {
  [sourceName: string]: SpecDigest;
}

const CACHE_PATH = ".nexus/cache.json";
const DIGEST_PATH = ".nexus/digests.json";

// ── Shared I/O ──────────────────────────────────────────────────────────────

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(path: string): T | null {
  const filePath = resolveProject(path);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (err) {
    console.warn(`Failed to parse ${path}:`, err);
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  const filePath = resolveProject(path);
  ensureParentDir(filePath);
  writeFileSync(filePath, JSON.stringify(data), "utf-8");
}

// ── Fingerprint Cache ───────────────────────────────────────────────────────

export function loadCache(cachePath?: string): FingerprintCache {
  return readJson<FingerprintCache>(cachePath ?? CACHE_PATH) ?? {};
}

export function saveCache(cache: FingerprintCache, cachePath?: string): void {
  writeJson(cachePath ?? CACHE_PATH, cache);
}

export function getCachedFingerprints(
  cache: FingerprintCache,
  sourceName: string,
): Record<string, string> {
  return cache[sourceName] ?? {};
}

export function updateCachedFingerprints(
  cache: FingerprintCache,
  sourceName: string,
  fingerprints: Record<string, string>,
): FingerprintCache {
  return { ...cache, [sourceName]: fingerprints };
}

export function removeCachedSource(cache: FingerprintCache, sourceName: string): FingerprintCache {
  const { [sourceName]: _, ...rest } = cache;
  return rest;
}

// ── Digest Cache ────────────────────────────────────────────────────────────

export function loadDigestCache(digestPath?: string): DigestCache {
  return readJson<DigestCache>(digestPath ?? DIGEST_PATH) ?? {};
}

export function saveDigestCache(cache: DigestCache, digestPath?: string): void {
  writeJson(digestPath ?? DIGEST_PATH, cache);
}

export function getCachedDigest(cache: DigestCache, sourceName: string): SpecDigest | null {
  const digest = cache[sourceName];
  if (!digest) return null;
  /* Migrate old cached digests that lack the _kind discriminant */
  if (!("_kind" in digest))
    return { ...(digest as object), _kind: "digest" as const } as SpecDigest;
  return digest;
}

export function updateCachedDigest(
  cache: DigestCache,
  sourceName: string,
  digest: SpecDigest,
): DigestCache {
  return { ...cache, [sourceName]: digest };
}

export function removeCachedDigest(cache: DigestCache, sourceName: string): DigestCache {
  const { [sourceName]: _, ...rest } = cache;
  return rest;
}
