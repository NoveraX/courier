import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

import { errnoCode } from "../apply/file-ops";

/** The largest file of the agents' rules Courier reads, 1 MiB: a larger one is left as it is. */
export const AGENT_FILE_MAX_BYTES: number = 1024 * 1024;

/** A file of the agents' rules — AGENTS.md — as Courier reads it: not there, its text, or why it is left as it is. */
export type AgentFile =
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "left"; readonly why: string };

/** What Courier reads a file of the agents' rules for: to change it, or only to see what it holds. */
export type AgentFilePurpose = "change" | "read";

/* Not following a link, so one swapped in fails the open; not blocking, so a FIFO is refused by its fstat rather than waited on. */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
/* What an open that refuses to follow a link reports: ELOOP on Linux and macOS, EMLINK on FreeBSD. */
const LINK_CODES: ReadonlySet<string> = new Set(["ELOOP", "EMLINK"]);
const LARGER = "it is larger than 1 MiB";
const READ_ONLY = "it is read-only";
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/* At most one byte past the limit, read through one descriptor: enough to tell a larger file. */
function bytesOf(fd: number): Buffer {
  const buffer = Buffer.alloc(AGENT_FILE_MAX_BYTES + 1);
  let filled = 0;
  for (let read = 1; read > 0 && filled < buffer.length; filled += read)
    read = readSync(fd, buffer, filled, buffer.length - filled, null);
  return buffer.subarray(0, filled);
}

function opened(path: string, purpose: AgentFilePurpose): AgentFile {
  let fd: number;
  try {
    fd = openSync(path, READ_FLAGS);
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT") return { kind: "none" };
    if (code !== undefined && LINK_CODES.has(code)) return { kind: "left", why: "it is a link" };
    return { kind: "left", why: `it could not be read (${code ?? String(error)})` };
  }
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile()) return { kind: "left", why: "it is not a file" };
    /* No write bit for its owner: on Windows, the read-only attribute, the one bit of a mode it keeps. */
    if (purpose === "change" && (stats.mode & 0o200) === 0) return { kind: "left", why: READ_ONLY };
    if (stats.size > AGENT_FILE_MAX_BYTES) return { kind: "left", why: LARGER };
    const bytes = bytesOf(fd);
    if (bytes.length > AGENT_FILE_MAX_BYTES) return { kind: "left", why: LARGER };
    return { kind: "text", text: UTF8.decode(bytes) };
  } catch (error) {
    if (error instanceof TypeError) return { kind: "left", why: "it is not UTF-8 text" };
    throw error;
  } finally {
    closeSync(fd);
  }
}

/**
 * Read a file of the agents' rules as Courier may change it: a regular
 * file — a link at its name is never followed — of 1 MiB at most, its text
 * UTF-8, its BOM kept in the text, and one its owner may write. Any other
 * is left as it is, and why is said; a file that cannot be read for its
 * permissions is one. A file Courier only looks into may be read-only.
 *
 * @param path - The file
 * @param purpose - `change`, the default, for a file Courier may write; `read` for one it only reads, such as the file a link leads to
 * @returns Its text, `none` where nothing is there, or why it is left as it is
 * @example
 * ```ts
 * const file = readAgentFile(join(root, "AGENTS.md"));
 * if (file.kind === "left") console.warn(`AGENTS.md was left as it is: ${file.why}`);
 * ```
 */
export function readAgentFile(path: string, purpose: AgentFilePurpose = "change"): AgentFile {
  const named = lstatSync(path, { throwIfNoEntry: false });
  if (named === undefined) return { kind: "none" };
  if (named.isSymbolicLink()) return { kind: "left", why: "it is a link" };
  if (!named.isFile()) return { kind: "left", why: "it is not a file" };
  if (named.size > AGENT_FILE_MAX_BYTES) return { kind: "left", why: LARGER };
  return opened(path, purpose);
}
