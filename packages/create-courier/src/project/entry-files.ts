import { posix } from "node:path";

import { codeMatches, type SourceScan } from "../edit/source-scan";
import { isRecord } from "../is-record";
import { parseJsonc } from "./jsonc";
import { projectCode } from "./project-code";
import type { Project } from "./read-project";

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/* A file a script runs: `tsx watch src/index.ts`, `node dist/main.js`, `fastify start app.js`. */
const SCRIPT_FILE = /(?:^|[\s=])\.?\/?([\w@./-]+\.[cm]?[jt]sx?)(?=\s|$)/g;
/* The `main` a Cloudflare Worker's wrangler.toml names. */
const WRANGLER_MAIN = /^\s*main\s*=\s*(["'])([^"'\n]+)\1/m;

/* A JSON file of the project's, or nothing where it is not there or not JSON. */
function jsonOf(project: Project, path: string): Record<string, unknown> {
  try {
    const parsed = parseJsonc(project.read(path) ?? "{}");
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/* The worker a wrangler config starts from: Hono's entry on Cloudflare. */
function wranglerMain(project: Project): string[] {
  const toml = WRANGLER_MAIN.exec(project.read("wrangler.toml") ?? "")?.[2];
  const json = ["wrangler.jsonc", "wrangler.json"]
    .map((path) => jsonOf(project, path).main)
    .filter((main): main is string => typeof main === "string");
  return [...(toml ? [toml] : []), ...json];
}

/**
 * The files the project starts from: package.json's `main`, `module` and
 * `bin`, the files its scripts run — a build's output read as the source it
 * is built from — and the worker a wrangler config names.
 *
 * @param project - The project
 * @returns Their paths, relative to the root and without extension
 * @example
 * ```ts
 * entryFiles(project).has("src/index"); // true where a script runs `tsx watch src/index.ts`
 * ```
 */
export function entryFiles(project: Project): Set<string> {
  const manifest = jsonOf(project, "package.json");
  const bin = isRecord(manifest.bin) ? Object.values(manifest.bin) : [manifest.bin];
  const named = [manifest.main, manifest.module, ...bin].filter(
    (each): each is string => typeof each === "string",
  );
  const run = Object.values(project.manifest.scripts).flatMap((script) =>
    [...script.matchAll(SCRIPT_FILE)].map((match) => match[1] ?? ""),
  );
  return new Set(
    [...named, ...run, ...wranglerMain(project)].flatMap((file) => {
      const bare = posix.normalize(file.replace(/^\.\//, "")).replace(EXTENSION, "");
      return [bare, bare.replace(/^(?:dist|build|out|lib)\//, "src/")];
    }),
  );
}

/* An object property's value as written, from where it starts to its comma or the object's close, past the brackets inside it. */
function propertyValue(scan: SourceScan, from: number): string {
  let at = from;
  while (at < scan.text.length) {
    const nested = scan.code[at] === 1 ? scan.closer.get(at) : undefined;
    if (nested !== undefined) at = nested;
    else if (scan.code[at] === 1 && /[,})\]]/.test(scan.text[at] ?? "")) break;
    at++;
  }
  return scan.text.slice(from, at);
}

/**
 * The folders Fastify's autoload registers every file of, as the project's
 * code names them: the folder its `dir` option ends with, beside the file
 * that registers it — `join(import.meta.dirname, "modules")`.
 *
 * @param project - The project
 * @returns The folders, relative to the root
 * @example
 * ```ts
 * autoloadFolders(project); // ["src/modules"]
 * ```
 */
export function autoloadFolders(project: Project): string[] {
  return projectCode(project)
    .filter((file) => file.imports.some((each) => each.specifier === "@fastify/autoload"))
    .flatMap((file) =>
      codeMatches(file.scan, /\bdir\s*:/g).flatMap((match) => {
        const value = propertyValue(file.scan, match.index + match[0].length);
        const folder = [...value.matchAll(/(["'`])([\w./-]+)\1/g)].at(-1)?.[2];
        return folder === undefined
          ? []
          : [posix.normalize(posix.join(posix.dirname(file.path), folder))];
      }),
    );
}
