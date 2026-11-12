import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { isRecord } from "../../util/is-record";
import { mentions } from "./mentions";
import { scriptTags } from "./script-tags";
import { type Unread, walkFolders } from "./source-walk";

/** Which piece of its file a piece of code is: the module whole, a `<script>` block, or an Astro file's frontmatter. */
export type PieceKind = "module" | "script" | "frontmatter";

/** A piece of a file's code an upgrade reads: a module whole, or a script block of a component's file. */
export interface CodePiece {
  /** The file, relative to the workspace's root, `/`-separated. */
  readonly path: string;
  readonly text: string;
  /** Where the piece starts in the file. */
  readonly offset: number;
  /** The name oxc reads its language from: `.ts` for TypeScript, `.js` for JavaScript, `.tsx` with JSX. */
  readonly parseAs: string;
  readonly kind: PieceKind;
}

/** The project's code an upgrade reads, and what it did not read. */
export interface ProjectCode {
  /** The files that name Courier's packages, each with its text. */
  readonly files: ReadonlyArray<{ readonly path: string; readonly text: string }>;
  /** Every file of code the walk read, Courier's or not: what an import of one may lead to. */
  readonly paths: readonly string[];
  /** Each link to a file or folder the walk read by its own path: the link, and that path. */
  readonly links: ReadonlyMap<string, string>;
  /** Files and folders left unread, and why. */
  readonly unread: readonly Unread[];
  /** Whether the walk stopped at its limit of files, and what it read up to. */
  readonly stopped: boolean;
}

/* Only a file that names one of Courier's packages has code a migration of Courier's changes. */
const COURIER = "@noverax/";

/**
 * The files of a project's code that name Courier's packages, as
 * {@link walkFolders} walks the workspace: installed packages, version
 * control's folders and what builds write at a package's root left out,
 * a link read by the path it leads to, within the upgrade's limits — what
 * was left unread is named, and a walk that reaches its limit of files
 * says so.
 *
 * @param root - The workspace's folder
 * @returns The files, and what was left unread
 * @example
 * ```ts
 * projectCode("/work/shop").files.map((file) => file.path); // ["src/courier/api.ts", "src/app/page.tsx"]
 * ```
 */
export function projectCode(root: string): ProjectCode {
  const walked = walkFolders(root);
  const files: Array<{ path: string; text: string }> = [];
  for (const path of walked.files) {
    const text = readFileSync(join(root, path), "utf8");
    if (mentions(text, [COURIER])) files.push({ path, text });
  }
  return { ...walked, files, paths: walked.files };
}

/* The first line of a file Studio wrote, before the import it belongs to and the hash of what Studio wrote below. */
const STUDIO_MARK = "// @courier-generated ";
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Whether Studio wrote a file: its first line is Studio's header, read as
 * Studio reads it — the import the file belongs to, and the SHA-256 of
 * what Studio wrote below, by which it tells the person's edits from its
 * own.
 *
 * @param text - The file's text
 * @returns Whether it is
 * @example
 * ```ts
 * writtenByStudio(`// @courier-generated {"import":"pets","sha256":"${hash}"}\n…`); // true
 * ```
 */
export function writtenByStudio(text: string): boolean {
  const end = text.indexOf("\n");
  const first = (end === -1 ? text : text.slice(0, end)).replace(/\r$/, "");
  if (!first.startsWith(STUDIO_MARK)) return false;
  let header: unknown;
  try {
    header = JSON.parse(first.slice(STUDIO_MARK.length));
  } catch {
    return false;
  }
  return (
    isRecord(header) &&
    typeof header.import === "string" &&
    typeof header.sha256 === "string" &&
    HEX_64.test(header.sha256)
  );
}

/* `lang="ts"` on a script tag, or TypeScript's own `lang='tsx'`. */
function langOf(lang: string | undefined): string {
  const name = lang?.toLowerCase();
  return name === "ts" || name === "tsx" ? `.${name}` : ".js";
}

/**
 * The pieces of a file's code: the module whole, or each script block of
 * a Vue, Svelte or Astro component's file, read as HTML reads it
 * ({@link scriptTags}) — and an Astro file's frontmatter, which is
 * TypeScript, and so holds no block — each where it starts in the file.
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
    return [{ path, text, offset: 0, parseAs: extension, kind: "module" }];
  const pieces: CodePiece[] = [];
  let markup = 0;
  if (extension === ".astro") {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (front?.[1] !== undefined) {
      pieces.push({
        path,
        text: front[1],
        offset: front[0].indexOf(front[1]),
        parseAs: ".ts",
        kind: "frontmatter",
      });
      markup = front[0].length;
    }
  }
  for (const block of scriptTags(text, markup)) {
    pieces.push({
      path,
      text: block.text,
      offset: block.offset,
      parseAs: extension === ".astro" ? ".ts" : langOf(block.attributes.get("lang")),
      kind: "script",
    });
  }
  return pieces;
}
