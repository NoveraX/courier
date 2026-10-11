import { dirname } from "node:path";
import * as vscode from "vscode";

import type { HintDocument } from "./hint-store";

/** The languages Studio reads calls in: TypeScript, JavaScript, and the scripts of Vue, Svelte and Astro components. */
export const CALL_LANGUAGES: readonly string[] = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "vue",
  "svelte",
  "astro",
];

const READ = new Set(CALL_LANGUAGES);

/**
 * Whether Studio reads calls in a document: a file on disk, saved or not,
 * in one of the languages it reads.
 *
 * @param document - The document
 * @returns Whether its calls are asked for
 * @example
 * ```ts
 * readsCalls(vscode.window.activeTextEditor.document);
 * ```
 */
export function readsCalls(document: vscode.TextDocument): boolean {
  return document.uri.scheme === "file" && READ.has(document.languageId);
}

/**
 * A document as the hint store asks Studio about it: its path, version and
 * text as it stands in the editor, and the workspace folder it is in, where
 * the search for its Studio stops.
 *
 * @param document - The document
 * @returns What the store reads of it
 * @example
 * ```ts
 * await store.callsIn(hintDocument(editor.document));
 * ```
 */
export function hintDocument(document: vscode.TextDocument): HintDocument {
  const file = document.uri.fsPath;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? dirname(file);
  return { file, version: document.version, text: document.getText(), workspace: folder };
}
