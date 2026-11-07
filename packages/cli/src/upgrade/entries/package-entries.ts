import { posix } from "node:path";
import type { Project } from "@noverax/create-courier/engine";

import { isRecord } from "../../util/is-record";

/** Where an import of a workspace's package by its name leads, as its package.json says: the file each side loads, and every one either may. */
export interface PackageEntry {
  /** What a page's bundle loads, relative to the workspace's root. */
  readonly page: readonly string[];
  /** What the server's code loads. */
  readonly server: readonly string[];
  /** Every file a condition a page's bundler may match gives: any but a server's runtime's and the types'. */
  readonly pageMay: readonly string[];
  /** Every file a condition a server may match gives, a worker's `browser` among them: any but the types'. */
  readonly serverMay: readonly string[];
}

/* The conditions a page's bundler matches, and the server's runtime; `default` matches always. */
const PAGE = new Set(["browser", "import"]);
const SERVER = new Set(["node", "import"]);
/* The conditions a server's runtime matches alone, which no page's bundler takes; and the types, which nothing runs. */
const NOT_PAGE = new Set([
  "types",
  "node",
  "react-server",
  "edge-light",
  "workerd",
  "deno",
  "bun",
  "node-addons",
]);
const NOT_RUN = new Set(["types"]);

/* A target with every `*` of its paths filled with what a pattern's matched. */
function filled(target: unknown, star: string): unknown {
  if (typeof target === "string") return target.split("*").join(star);
  if (Array.isArray(target)) return target.map((each) => filled(each, star));
  if (!isRecord(target)) return target;
  return Object.fromEntries(Object.entries(target).map(([key, each]) => [key, filled(each, star)]));
}

/* What an exports map gives a subpath: its own key's, else the pattern's whose part before `*` is longest, as Node reads it. */
function subpathTarget(exports: Readonly<Record<string, unknown>>, subpath: string): unknown {
  if (Object.hasOwn(exports, subpath)) return exports[subpath];
  let best: { readonly head: number; readonly target: unknown } | undefined;
  for (const [key, target] of Object.entries(exports)) {
    const at = key.indexOf("*");
    const tail = key.slice(at + 1);
    const fits =
      at !== -1 &&
      subpath.startsWith(key.slice(0, at)) &&
      subpath.endsWith(tail) &&
      subpath.length >= key.length - 1;
    if (fits && (best === undefined || at > best.head))
      best = { head: at, target: filled(target, subpath.slice(at, subpath.length - tail.length)) };
  }
  return best?.target;
}

/* The path a target gives for a side's conditions, as Node reads them: the first condition, in the map's order, the side matches. */
function firstOf(target: unknown, conditions: ReadonlySet<string>): string | undefined {
  if (typeof target === "string") return target;
  const options = Array.isArray(target)
    ? target
    : isRecord(target)
      ? Object.entries(target)
          .filter(([condition]) => condition === "default" || conditions.has(condition))
          .map(([, each]) => each)
      : [];
  for (const each of options) {
    const found = firstOf(each, conditions);
    if (found !== undefined) return found;
  }
  return undefined;
}

/* Every path a target may give, under any condition but those left out. */
function everyOf(target: unknown, out: ReadonlySet<string>): string[] {
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.flatMap((each) => everyOf(each, out));
  if (!isRecord(target)) return [];
  return Object.entries(target)
    .filter(([condition]) => !out.has(condition))
    .flatMap(([, each]) => everyOf(each, out));
}

function manifestOf(project: Project | undefined): unknown {
  try {
    return JSON.parse(project?.read("package.json") ?? "null");
  } catch {
    return undefined;
  }
}

/* What a target gives each side, as Node reads its conditions: the first a side matches for certain, and every one it may match; a path out of the package, or a package's name, is no file of the package's. */
function sidesOf(target: unknown, at: (path: string) => string[]): PackageEntry {
  const local = (path: string | undefined) => (path?.startsWith("./") === true ? at(path) : []);
  return {
    page: local(firstOf(target, PAGE)),
    server: local(firstOf(target, SERVER)),
    pageMay: everyOf(target, NOT_PAGE).flatMap(local),
    serverMay: everyOf(target, NOT_RUN).flatMap(local),
  };
}

/* A path a package's own file names, from its folder relative to the workspace's root; none where it leads out of it. */
function inPackage(dir: string, path: string | undefined): string[] {
  if (path === undefined || posix.isAbsolute(path)) return [];
  const inside = posix.normalize(posix.join(dir || ".", path));
  return inside.startsWith("../") ? [] : [inside];
}

/**
 * Where a package.json `imports` key a package's own file names leads, as
 * {@link packageEntry} reads `exports`: the key's own target, or the
 * pattern's whose part before `*` is longest, read by each side's
 * conditions. A target that names a package leads to no file of the
 * package's.
 *
 * @param project - The package of the file that imports it
 * @param dir - Its folder, relative to the workspace's root
 * @param specifier - The import: `#api`, `#lib/format`
 * @returns The paths, relative to the workspace's root, as written; none where no key matches
 * @example
 * ```ts
 * importEntry(project, "apps/web", "#api")?.page; // ["apps/web/lib/api.browser.ts"]
 * ```
 */
export function importEntry(
  project: Project | undefined,
  dir: string,
  specifier: string,
): PackageEntry | undefined {
  const manifest = manifestOf(project);
  const imports = isRecord(manifest) && isRecord(manifest.imports) ? manifest.imports : undefined;
  const target = imports === undefined ? undefined : subpathTarget(imports, specifier);
  return target === undefined ? undefined : sidesOf(target, (path) => inPackage(dir, path));
}

/**
 * Where an import of a workspace's package by its name leads, as its
 * package.json says: through `exports` — a subpath's own key, or the
 * pattern it matches — the file each side's conditions give, a page's
 * `browser`, `import` and `default` and the server's `node`, `import` and
 * `default`, and every file a condition either side may match gives — a
 * page none of a server's runtime's, a server any, as a worker matches
 * `browser`; without `exports`, a page's `browser` or `module` and the
 * server's `main`, or a subpath as a path in the package. A subpath the
 * package does not export leads nowhere.
 *
 * @param project - The package
 * @param dir - Its folder, relative to the workspace's root
 * @param subpath - What the import names of it: `.`, or `./button`
 * @returns The paths, relative to the workspace's root, as written
 * @example
 * ```ts
 * packageEntry(project, "packages/api", ".").server; // ["packages/api/src/server.ts"]
 * ```
 */
export function packageEntry(
  project: Project | undefined,
  dir: string,
  subpath: string,
): PackageEntry {
  const manifest = manifestOf(project);
  const at = (path: string | undefined) => inPackage(dir, path);
  const exports = isRecord(manifest) ? manifest.exports : undefined;
  if (exports !== undefined && exports !== null) {
    const keyed = isRecord(exports) && Object.keys(exports).some((key) => key.startsWith("."));
    return sidesOf(subpathTarget(keyed ? exports : { ".": exports }, subpath), at);
  }
  if (subpath !== ".") {
    const path = at(subpath);
    return { page: path, server: path, pageMay: path, serverMay: path };
  }
  const field = (name: string) =>
    isRecord(manifest) && typeof manifest[name] === "string" ? manifest[name] : undefined;
  const main = at(field("main") ?? "index");
  const page = at(field("browser") ?? field("module"))
    .concat(main)
    .slice(0, 1);
  const may = [...new Set([...page, ...at(field("module")), ...main])];
  return { page, server: main, pageMay: may, serverMay: may };
}
