import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { UPGRADE_LIMITS } from "../limits";
import { mentions } from "./mentions";

/** A piece of a file's code an upgrade reads: a module whole, or a script block of a component's file. */
export interface CodePiece {
  /** The file, relative to the workspace's root, `/`-separated. */
  readonly path: string;
  readonly text: string;
  /** Where the piece starts in the file. */
  readonly offset: number;
  /** The name oxc reads its language from: `.ts` for TypeScript, `.js` for JavaScript, `.tsx` with JSX. */
  readonly parseAs: string;
}

/** The project's code an upgrade reads, and what it did not read. */
export interface ProjectCode {
  /** The files that name Courier's packages, each with its text. */
  readonly files: ReadonlyArray<{ readonly path: string; readonly text: string }>;
  /** Files left unread, and why: too large to read. */
  readonly unread: ReadonlyArray<{ readonly path: string; readonly why: string }>;
  /** Whether the walk stopped at its limit of files, and what it read up to. */
  readonly stopped: boolean;
}

const CODE = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
]);
/* Folders of installed packages and of what builds write: no code of the project's own. */
const SKIPPED = new Set(["node_modules", "dist", "build", "out", "coverage", "storybook-static"]);
/* Only a file that names one of Courier's packages has code a migration of Courier's changes. */
const COURIER = "@noverax/";

/**
 * The files of a project's code that name Courier's packages: walked from
 * the workspace's root, leaving out installed packages, what builds write
 * and folders whose names start with a dot, within the upgrade's limits —
 * a file too large is named as unread, and a walk that reaches its limit
 * of files says so.
 *
 * @param root - The workspace's folder
 * @returns The files, and what was left unread
 * @example
 * ```ts
 * projectCode("/work/shop").files.map((file) => file.path); // ["src/courier/api.ts", "src/app/page.tsx"]
 * ```
 */
export function projectCode(root: string): ProjectCode {
  const files: Array<{ path: string; text: string }> = [];
  const unread: Array<{ path: string; why: string }> = [];
  let seen = 0;
  const walkDir = (dir: string, depth: number): boolean => {
    if (depth > UPGRADE_LIMITS.sourceDepth) return true;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
        if (!walkDir(path, depth + 1)) return false;
      } else if (entry.isFile() && CODE.has(extname(entry.name))) {
        if (++seen > UPGRADE_LIMITS.sourceFiles) return false;
        const { size } = statSync(join(root, path));
        if (size > UPGRADE_LIMITS.sourceBytes) {
          unread.push({
            path,
            why: `it is ${(size / 1024 / 1024).toFixed(1)} MiB, past the ${UPGRADE_LIMITS.sourceBytes / 1024 / 1024} MiB an upgrade reads`,
          });
          continue;
        }
        const text = readFileSync(join(root, path), "utf8");
        if (mentions(text, [COURIER])) files.push({ path, text });
      }
    }
    return true;
  };
  const stopped = !walkDir("", 0);
  return { files, unread, stopped };
}

/* `lang="ts"` on a script tag, or TypeScript's own `lang='tsx'`. */
function langOf(attributes: string): string {
  const lang = /\blang\s*=\s*["']?([a-z]+)/i.exec(attributes)?.[1]?.toLowerCase();
  return lang === "ts" || lang === "tsx" ? `.${lang}` : ".js";
}

/**
 * The pieces of a file's code: the module whole, or each script block of
 * a Vue, Svelte or Astro component's file — and an Astro file's
 * frontmatter, which is TypeScript — each where it starts in the file.
 *
 * @param path - The file, relative to the root
 * @param text - Its text
 * @returns The pieces
 * @example
 * ```ts
 * codePieces("src/App.vue", text); // [{ path: "src/App.vue", text: "import …", offset: 31, parseAs: ".ts" }]
 * ```
 */
export function codePieces(path: string, text: string): CodePiece[] {
  const extension = extname(path);
  if (extension !== ".vue" && extension !== ".svelte" && extension !== ".astro")
    return [{ path, text, offset: 0, parseAs: extension }];
  const pieces: CodePiece[] = [];
  if (extension === ".astro") {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (front?.[1] !== undefined)
      pieces.push({ path, text: front[1], offset: front[0].indexOf(front[1]), parseAs: ".ts" });
  }
  for (const block of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [whole, attributes = "", body = ""] = block;
    const offset = (block.index ?? 0) + whole.indexOf(">") + 1;
    pieces.push({
      path,
      text: body,
      offset,
      parseAs: extension === ".astro" ? ".ts" : langOf(attributes),
    });
  }
  return pieces;
}
