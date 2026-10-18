import { posix, relative, resolve, sep } from "node:path";

import { isRecord } from "../is-record";
import type { Project } from "./read-project";
import { tsconfigChain } from "./tsconfig-chain";

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** A prefix the project's tooling maps to folders: a tsconfig `paths` key, or a package.json `imports` key. */
interface Alias {
  readonly key: string;
  /** The folder its targets are named from. */
  readonly base: string;
  /** Each target as written, which may hold a `*`. */
  readonly targets: readonly string[];
}

/** How the project resolves a specifier that is not relative. */
interface Aliases {
  readonly aliases: readonly Alias[];
  /** The folder bare specifiers are read from, where the tsconfig names a `baseUrl`. */
  readonly baseUrl: string | undefined;
}

const cache = new WeakMap<Project, Aliases>();

/* The levels of the project's tsconfig; none where one of them is not JSON, as TypeScript itself would refuse it. */
function levelsOf(project: Project): ReturnType<typeof tsconfigChain> {
  try {
    return tsconfigChain(project.root);
  } catch {
    return [];
  }
}

/* `paths`, read against `baseUrl` where one is set, else against the tsconfig that names them. */
function tsconfigAliases(project: Project): Aliases {
  const levels = levelsOf(project);
  const pathsLevel = levels.find((level) => isRecord(level.options.paths));
  const baseLevel = levels.find((level) => typeof level.options.baseUrl === "string");
  const baseUrl = baseLevel ? resolve(baseLevel.dir, String(baseLevel.options.baseUrl)) : undefined;
  const from = baseUrl ?? pathsLevel?.dir ?? project.root;
  const paths = pathsLevel && isRecord(pathsLevel.options.paths) ? pathsLevel.options.paths : {};
  const aliases = Object.entries(paths).map(([key, targets]) => ({
    key,
    base: from,
    targets: (Array.isArray(targets) ? targets : []).filter(
      (target): target is string => typeof target === "string",
    ),
  }));
  return { aliases, baseUrl };
}

/* A package.json `imports` value: a path, or the first path its conditions give, its types aside. */
function importTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(importTarget).find((each) => each !== undefined);
  if (!isRecord(value)) return undefined;
  /* The code a condition names, not the types beside it. */
  return Object.entries(value)
    .filter(([condition]) => condition !== "types")
    .map(([, each]) => importTarget(each))
    .find((each) => each !== undefined);
}

/* The `#` subpaths package.json maps to the project's own files. */
function packageImports(project: Project): Alias[] {
  let manifest: unknown;
  try {
    manifest = JSON.parse(project.read("package.json") ?? "{}");
  } catch {
    return [];
  }
  const imports = isRecord(manifest) && isRecord(manifest.imports) ? manifest.imports : {};
  return Object.entries(imports).flatMap(([key, value]) => {
    const target = importTarget(value);
    return target?.startsWith("./") ? [{ key, base: project.root, targets: [target] }] : [];
  });
}

function aliasesOf(project: Project): Aliases {
  const known = cache.get(project);
  if (known) return known;
  const fromTsconfig = tsconfigAliases(project);
  const aliases = {
    ...fromTsconfig,
    aliases: [...fromTsconfig.aliases, ...packageImports(project)],
  };
  cache.set(project, aliases);
  return aliases;
}

/* A target as written with every `*` filled with what the key's matched, as
   Node fills an import's — a tsconfig target holds one at most — before it
   is named from its folder, whose own name may hold a `*`; a `$` in what
   matched is not read as a replacement pattern. */
function withStars(target: string, star: string): string {
  return target.split("*").join(star);
}

/* What a key's `*` stands for in a specifier, or `undefined` where the key does not match it. */
function captured(key: string, specifier: string): string | undefined {
  const star = key.indexOf("*");
  if (star === -1) return key === specifier ? "" : undefined;
  const [head, tail] = [key.slice(0, star), key.slice(star + 1)];
  const fits =
    specifier.startsWith(head) &&
    specifier.endsWith(tail) &&
    specifier.length >= head.length + tail.length;
  return fits ? specifier.slice(head.length, specifier.length - tail.length) : undefined;
}

/* An absolute path as the project names its files: relative to the root, `/`-separated, without its extension. */
function bare(project: Project, path: string): string | undefined {
  const inside = relative(project.root, path).split(sep).join("/");
  return inside === "" || inside.startsWith("..") ? undefined : inside.replace(EXTENSION, "");
}

/* Whether a path without extension is a file of code, or a folder with an index. */
function isCode(project: Project, path: string): boolean {
  return CODE_EXTENSIONS.some(
    (extension) =>
      project.exists(`${path}${extension}`) || project.exists(`${path}/index${extension}`),
  );
}

/**
 * The files of the project's own a specifier that is not relative may
 * name, as the project's tooling resolves it: a tsconfig `paths` key —
 * read through what the tsconfig extends, against its `baseUrl` — a
 * package.json `imports` key, or a path from the `baseUrl`, where a file
 * of code is there.
 *
 * @param project - The project
 * @param specifier - The specifier, as a file of the project's writes it
 * @returns The files it may name, relative to the root and without extension; none for a package
 * @example
 * ```ts
 * aliasedFiles(project, "@server/courier/routes"); // ["src/server/courier/routes"] where paths maps "@server/*" to "./src/server/*"
 * ```
 */
export function aliasedFiles(project: Project, specifier: string): string[] {
  const { aliases, baseUrl } = aliasesOf(project);
  const plain = specifier.replace(EXTENSION, "");
  const mapped = aliases.flatMap(({ key, base, targets }) => {
    const star = captured(key, specifier) ?? captured(key, plain);
    if (star === undefined) return [];
    return targets.flatMap((target) => bare(project, resolve(base, withStars(target, star))) ?? []);
  });
  const fromBase = baseUrl === undefined ? undefined : bare(project, resolve(baseUrl, plain));
  const based = fromBase !== undefined && isCode(project, fromBase) ? [fromBase] : [];
  return [...new Set([...mapped, ...based].map((path) => posix.normalize(path)))];
}
