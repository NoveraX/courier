/**
 * Code normalization and SHA-256 hashing for fingerprint comparison.
 *
 * Normalizes formatting differences (tabs vs spaces, semicolons, comments)
 * to prevent false "modified" classifications.
 */

import { createHash } from "node:crypto";

/**
 * Normalize code before hashing: strip comments, trailing commas, whitespace.
 */
export function normalizeCode(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "") // strip single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // strip block comments
    .replace(/,(\s*[}\])])/g, "$1") // strip trailing commas
    .replace(/\s+/g, "") // strip all whitespace
    .trim();
}

/** Compute SHA-256 hash of normalized code (16-char hex) */
export function computeHash(code: string): string {
  const normalized = normalizeCode(code);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
