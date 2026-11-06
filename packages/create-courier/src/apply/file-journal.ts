import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { createFileOnce, errnoCode, projectPath, replaceFile } from "./file-ops";
import { SetupFailure } from "./setup-failure";

/** A file a run could not put back as it was, and why. */
export interface KeptFile {
  /** Relative to the project's root. */
  readonly path: string;
  readonly why: string;
}

/** What undoing a run's changes did. */
export interface Undone {
  /** The files it had added, removed again. */
  readonly removed: readonly string[];
  /** The files it had changed, put back as they were. */
  readonly putBack: readonly string[];
  readonly kept: readonly KeptFile[];
}

type Entry =
  | {
      readonly kind: "created";
      readonly path: string;
      readonly real: string;
      readonly content: string;
    }
  | {
      readonly kind: "replaced";
      readonly path: string;
      readonly real: string;
      readonly before: string;
      readonly after: string;
    }
  | { readonly kind: "folder"; readonly path: string; readonly real: string };

const CHANGED_SINCE = "it changed since the setup wrote it, so it was left as it is";

function textAt(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* What undoing one entry came to: done, kept as it is and why, or kept as a folder another one kept explains. */
type Outcome =
  | { readonly kind: "undone" }
  | { readonly kind: "kept"; readonly why: string }
  | { readonly kind: "explained" };

const UNDONE: Outcome = { kind: "undone" };

/* Remove a folder the setup made, once empty; one that holds others' files stays — named, unless it holds only folders kept already. */
function undoFolder(entry: Entry, keptFolders: Set<string>): Outcome {
  try {
    rmdirSync(entry.real);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return UNDONE;
    if (errnoCode(error) !== "ENOTEMPTY") throw error;
    keptFolders.add(entry.real);
    const names = readdirSync(entry.real);
    if (names.every((name) => keptFolders.has(join(entry.real, name))))
      return { kind: "explained" };
    return { kind: "kept", why: "it holds files the setup did not write" };
  }
  return UNDONE;
}

/* Undo one entry, where it still holds what the setup wrote. */
function undo(entry: Entry, keptFolders: Set<string>): Outcome {
  if (entry.kind === "folder") return undoFolder(entry, keptFolders);
  const now = textAt(entry.real);
  if (entry.kind === "created") {
    if (now === undefined) return UNDONE;
    if (now !== entry.content) return { kind: "kept", why: CHANGED_SINCE };
    unlinkSync(entry.real);
    return UNDONE;
  }
  if (now !== entry.after) return { kind: "kept", why: CHANGED_SINCE };
  replaceFile(entry.real, entry.before);
  return UNDONE;
}

/**
 * The files a run adds and changes in a project, each written all at
 * once and noted, so the run can be undone: a file it added is removed
 * again, and one it changed put back — each only while it still holds
 * what the run wrote, since a file changed after that is someone's work.
 * The folders it made are removed once empty.
 *
 * @example
 * ```ts
 * const journal = new FileJournal(root);
 * journal.create("courier.config.ts", config);
 * journal.replace("vite.config.ts", before, after);
 * journal.undo(); // { removed: ["courier.config.ts"], putBack: ["vite.config.ts"], kept: [] }
 * ```
 */
export class FileJournal {
  readonly #root: string;
  readonly #entries: Entry[] = [];

  /**
   * @param root - The project's folder
   */
  constructor(root: string) {
    this.#root = root;
  }

  /** The files added, relative to the root. */
  get written(): string[] {
    return this.#entries.flatMap((entry) => (entry.kind === "created" ? [entry.path] : []));
  }

  /** The files of the project's changed. */
  get changed(): string[] {
    return this.#entries.flatMap((entry) => (entry.kind === "replaced" ? [entry.path] : []));
  }

  /**
   * Add a file where nothing is.
   *
   * @param path - Relative to the root, `/`-separated
   * @param content - Its content
   * @throws {SetupFailure} When something is there by now, the path leads out of the project, or it cannot be written
   */
  create(path: string, content: string): void {
    const real = projectPath(this.#root, path);
    this.#write(path, () => {
      this.#folders(dirname(real));
      createFileOnce(real, content);
    });
    this.#entries.push({ kind: "created", path, real, content });
  }

  /**
   * Change a file of the project's, while it holds what it held when the
   * change was worked out.
   *
   * @param path - Relative to the root, `/`-separated
   * @param before - What it holds now
   * @param after - What it is to hold
   * @throws {SetupFailure} When it holds something else, the path leads out of the project, or it cannot be written
   */
  replace(path: string, before: string, after: string): void {
    const real = projectPath(this.#root, path);
    if (textAt(real) !== before)
      throw new SetupFailure("FILE_CHANGED", `${path} changed while the plan was shown`);
    this.#write(path, () => replaceFile(real, after));
    this.#entries.push({ kind: "replaced", path, real, before, after });
  }

  /**
   * Undo every change, the last first.
   *
   * @returns What was removed and put back, and what was not and why
   */
  undo(): Undone {
    const removed: string[] = [];
    const putBack: string[] = [];
    const kept: KeptFile[] = [];
    const keptFolders = new Set<string>();
    for (const entry of this.#entries.splice(0).reverse()) {
      let outcome: Outcome;
      try {
        outcome = undo(entry, keptFolders);
      } catch (error) {
        outcome = { kind: "kept", why: messageOf(error) };
      }
      if (outcome.kind === "kept") kept.push({ path: entry.path, why: outcome.why });
      else if (outcome.kind === "undone" && entry.kind === "created") removed.push(entry.path);
      else if (outcome.kind === "undone" && entry.kind === "replaced") putBack.push(entry.path);
    }
    return { removed, putBack, kept };
  }

  /* Make the folders missing above a file, one at a time, noting each to remove it again. */
  #folders(dir: string): void {
    const missing: string[] = [];
    for (let at = dir; !existsSync(at); at = dirname(at)) missing.unshift(at);
    for (const folder of missing) {
      mkdirSync(folder);
      const path = relative(realpathSync(this.#root), folder).replaceAll("\\", "/");
      this.#entries.push({ kind: "folder", path, real: folder });
    }
  }

  #write(path: string, write: () => void): void {
    try {
      write();
    } catch (error) {
      if (error instanceof SetupFailure) throw error;
      throw new SetupFailure("WRITE_FAILED", `${path} could not be written: ${messageOf(error)}`, {
        cause: error,
      });
    }
  }
}
