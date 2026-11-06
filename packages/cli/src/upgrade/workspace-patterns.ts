import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isRecord } from "../util/is-record";
import { parseJsonc } from "../util/parse-jsonc";

/* A YAML value as pnpm-workspace.yaml writes a glob: bare, or quoted either way. */
function unquoted(value: string): string {
  const text = value.trim();
  return /^(["']).*\1$/.test(text) ? text.slice(1, -1) : text;
}

/* A line without the comment YAML lets it end with: a # after a space, outside quotes. */
function withoutComment(line: string): string {
  let quote: string | undefined;
  for (let at = 0; at < line.length; at++) {
    const char = line[at];
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (at === 0 || /\s/.test(line[at - 1] ?? ""))) return line.slice(0, at);
  }
  return line;
}

/**
 * The globs `pnpm-workspace.yaml` lists under `packages`: as a block of
 * `- glob` lines, or a flow list on the key's own line. The rest of the
 * file is not read.
 *
 * @param text - The file
 * @returns The globs, in order; none where it lists none
 * @example
 * ```ts
 * pnpmPackages('packages:\n  - "apps/*"\n  - packages/*\n'); // ["apps/*", "packages/*"]
 * ```
 */
export function pnpmPackages(text: string): string[] {
  const lines = text.split(/\r?\n/).map(withoutComment);
  const at = lines.findIndex((line) => /^packages\s*:/.test(line));
  if (at === -1) return [];
  const inline = (lines[at] ?? "").replace(/^packages\s*:/, "").trim();
  if (inline.startsWith("["))
    return inline
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(unquoted)
      .filter((glob) => glob !== "");
  const globs: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "") continue;
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item === null) break;
    globs.push(unquoted(item[1] ?? ""));
  }
  return globs;
}

/**
 * The globs a folder's package manager reads its workspace's packages
 * from: package.json's `workspaces` — a list, or `{ packages }` as Yarn
 * writes it — or `pnpm-workspace.yaml`'s `packages`.
 *
 * @param dir - The folder
 * @returns The globs; `undefined` where the folder is the root of no workspace
 * @example
 * ```ts
 * workspacePatterns("/work/shop"); // ["apps/*", "packages/*"]
 * ```
 */
export function workspacePatterns(dir: string): string[] | undefined {
  const pnpm = join(dir, "pnpm-workspace.yaml");
  if (existsSync(pnpm)) return pnpmPackages(readFileSync(pnpm, "utf8"));
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) return undefined;
  const parsed = parseJsonc(readFileSync(manifest, "utf8"));
  const listed = isRecord(parsed) ? parsed.workspaces : undefined;
  const globs = !Array.isArray(listed) && isRecord(listed) ? listed.packages : listed;
  if (!Array.isArray(globs)) return undefined;
  return globs.filter((glob): glob is string => typeof glob === "string");
}
