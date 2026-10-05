import { create } from "zustand";

import type { ImportSource } from "@/features/apis/types-generate";
import { isPlainObject } from "@/socket/is-plain-object";

/* A pasted spec is kept while it is small; a large one, or a file, is picked again. */
const KEPT_TEXT_CHARS = 64 * 1024;

/** An API import left unfinished: where its spec comes from, and the address or text typed. */
export interface KeptImport {
  source: ImportSource;
  content: string;
}

/**
 * The API import left unfinished, kept in the project: the import wizard
 * opens with it again, here or in another browser, until a write ends it.
 *
 * @example
 * ```ts
 * useKeptImport.setState({ kept: keptImport("url", "https://api.example/openapi.json") });
 * ```
 */
export const useKeptImport = create<{ kept: KeptImport | null }>(() => ({ kept: null }));

/**
 * What of an unfinished import is worth keeping: an address, or a pasted
 * spec while it is small. A file is not kept — it is picked again — nor is
 * an empty field.
 *
 * @param source - Where the spec comes from
 * @param content - The address or text typed
 * @returns What to keep, or `null` when nothing is
 * @example
 * ```ts
 * keptImport("file", "openapi: 3.1.0"); // → null
 * ```
 */
export function keptImport(source: ImportSource, content: string): KeptImport | null {
  if (source === "file" || content.trim() === "") return null;
  if (source === "raw" && content.length > KEPT_TEXT_CHARS) return null;
  return { source, content };
}

/**
 * Read a kept import, as the project keeps it.
 *
 * @param raw - What the project keeps
 * @returns The import, or `null` for none of its shape
 * @example
 * ```ts
 * readKeptImport({ source: "url", content: "https://api.example/openapi.json" });
 * ```
 */
export function readKeptImport(raw: unknown): KeptImport | null {
  if (!isPlainObject(raw) || typeof raw.content !== "string") return null;
  if (raw.source !== "url" && raw.source !== "raw") return null;
  return keptImport(raw.source, raw.content);
}
