/**
 * Fingerprint helpers — collect, build fallback, and detect user modifications.
 */

import { generateFingerprints } from "../apis";

/** Collect fingerprints from a set of generated files */
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
