import type { ServedTool, ToolOutcome } from "@noverax/courier-mcp/internal";

import { type Docs, DocsFolderError } from "../docs";
import { type SearchIndex, searchIndex } from "../search";

/** Reads the docs folder: called once, as the first tool call asks for it. */
export type DocsLoader = () => Docs;

/** The docs as the tools read them, and their index once a search asks for it. */
export interface DocsSource {
  /** @throws {DocsFolderError} When the folder could not be read */
  docs(): Docs;
  /** @throws {DocsFolderError} When the folder could not be read */
  index(): SearchIndex;
}

/**
 * The docs, read as the first call asks for them, and their index as the
 * first search does — or, every time after, why the folder could not be read.
 *
 * @param load - Reads the docs folder
 * @returns The source
 */
export function docsSource(load: DocsLoader): DocsSource {
  let docs: Docs | DocsFolderError | undefined;
  let index: SearchIndex | undefined;
  const loaded = (): Docs => {
    if (docs === undefined) {
      try {
        docs = load();
      } catch (error) {
        if (!(error instanceof DocsFolderError)) throw error;
        docs = error;
      }
    }
    if (docs instanceof DocsFolderError) throw docs;
    return docs;
  };
  return {
    docs: loaded,
    index: () => {
      index ??= searchIndex(loaded());
      return index;
    },
  };
}

/**
 * A tool that only reads: the same call twice reads the same.
 *
 * @param tool - The tool, but for how it reads
 * @returns The tool
 */
export function readTool(tool: Omit<ServedTool, "access" | "idempotent" | "action">): ServedTool {
  return { ...tool, access: "read", idempotent: true, action: `read ${tool.name}` };
}

/**
 * Run a tool's work, answering a folder that cannot be read with what to do about it.
 *
 * @param work - What the tool does
 * @returns What came of it
 */
export function answer(work: () => ToolOutcome): Promise<ToolOutcome> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    if (error instanceof DocsFolderError)
      return Promise.resolve({ ok: false, message: error.message });
    return Promise.reject(error);
  }
}

/**
 * A call a tool will not make, and why.
 *
 * @param message - Why
 * @returns The outcome
 */
export function refused(message: string): ToolOutcome {
  return { ok: false, message };
}
