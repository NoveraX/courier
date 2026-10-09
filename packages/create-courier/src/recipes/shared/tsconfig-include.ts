import { appendItem } from "../../edit/insert";
import { properties } from "../../edit/literal";
import { nextCode, scanSource } from "../../edit/source-scan";
import { isRecord } from "../../is-record";
import { parseJsonc } from "../../project/jsonc";
import type { RecipeContext, RecipeEdit } from "../recipe-types";

/* The folder a tsconfig compiles from, where it names one below the root and lists no files of its own. */
function rootDirOf(text: string): string | undefined {
  let config: unknown;
  try {
    config = parseJsonc(text);
  } catch {
    return undefined;
  }
  if (!isRecord(config) || config.include !== undefined || config.files !== undefined)
    return undefined;
  const options = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  const dir = typeof options.rootDir === "string" ? options.rootDir.replace(/^\.\/|\/$/g, "") : "";
  return dir === "" || dir === "." || dir.startsWith("..") ? undefined : dir;
}

/* The tsconfig with `include` naming its rootDir. */
function withInclude(text: string, dir: string): string | undefined {
  const scan = scanSource(text);
  const open = scan === undefined ? -1 : nextCode(scan, 0);
  const close = scan?.closer.get(open);
  if (scan === undefined || text[open] !== "{" || close === undefined) return undefined;
  if (properties(scan, { open, close }).some((property) => property.key === "include")) return text;
  return appendItem(scan, { open, close }, `"include": ["${dir}"]`);
}

/**
 * Where a tsconfig compiles from a folder — `"rootDir": "./src"` — and
 * includes every file of the project, as create-hono's does, the edit that
 * includes only that folder: Courier's config at the root would otherwise
 * be taken in, and stop the build, as a file outside `rootDir`.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The edit, or none where the tsconfig has no such need
 * @example
 * ```ts
 * rootDirIncludeEdit(ctx); // [{ path: "tsconfig.json", … }] in a create-hono app
 * ```
 */
export function rootDirIncludeEdit(ctx: RecipeContext): RecipeEdit[] {
  const text = ctx.project.read("tsconfig.json");
  const dir = text === undefined ? undefined : rootDirOf(text);
  if (dir === undefined) return [];
  return [
    {
      path: "tsconfig.json",
      purpose: `compiles ${dir}/ alone: courier.config.ts at the root is outside rootDir`,
      change: (current) => withInclude(current, dir),
      manual: {
        file: "tsconfig.json",
        what: `Compile ${dir}/ alone, so the build leaves courier.config.ts at the root out`,
        lines: [`"include": ["${dir}"],`],
      },
    },
  ];
}
