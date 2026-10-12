/**
 * Turn a project's tsconfig `paths` into the two shapes that reading a config
 * needs: the alias map the module loader takes, and a lookup the dependency
 * walker uses to follow an aliased import.
 *
 * An alias that shadows an installed package is left out of both. Such an
 * entry redirects a dependency to its sources for the bundler's benefit —
 * `@acme/ui` to `../ui/src`, or a whole scope, `@acme/*` — and following it
 * would load a library's source instead of the build it ships, then treat
 * every file inside it as something the config depends on. A dependency
 * changes when it is reinstalled, not while the developer is editing; the
 * graph stops at the package boundary. A catch-all `*` covers every package,
 * so it is left out too: the loader, which cannot fall back to the package as
 * TypeScript does, would put its target before every path it loads.
 */

import { normalize, resolve } from "node:path";

import { type InstalledPackages, installedPackages, packageNameOf } from "./installed-packages";
import { scopeAliases, scopeOf } from "./scope-alias";
import { readTsconfigPaths, type TsconfigPaths } from "./tsconfig-paths";

/** Path aliases a project declares, ready for both consumers. */
export interface PathAliases {
  /**
   * Prefix → absolute target, in the shape jiti's `alias` option takes.
   * Only the first target of a mapping appears: jiti resolves one path per
   * alias, while `candidatesFor` offers every declared target.
   */
  readonly loader: Readonly<Record<string, string>>;
  /** Absolute paths `specifier` may denote, in declaration order. */
  candidatesFor(specifier: string): string[];
}

/** One `paths` entry, split around its wildcard. */
interface AliasEntry {
  prefix: string;
  suffix: string;
  wildcard: boolean;
  /** Absolute targets, each still carrying its own `*` placeholder. */
  targets: readonly string[];
}

const EMPTY: PathAliases = { loader: {}, candidatesFor: () => [] };

/**
 * Read the path aliases that apply to `projectRoot`.
 *
 * @param projectRoot - Directory holding the project's `tsconfig.json`
 * @returns The aliases, empty when the project declares none
 *
 * @example
 * ```ts
 * const aliases = readPathAliases("/app");
 * aliases.candidatesFor("@/lib/sources"); // → ["/app/src/lib/sources"]
 * ```
 */
export function readPathAliases(projectRoot: string): PathAliases {
  const mapping = readTsconfigPaths(projectRoot);
  if (!mapping) return EMPTY;

  const installed = installedPackages(projectRoot);
  const entries = toEntries(mapping).filter((entry) => !shadowsInstalled(entry, installed));
  if (entries.length === 0) return EMPTY;

  return {
    loader: toLoaderAlias(entries, installed),
    candidatesFor: (specifier) => candidatesOf(entries, specifier, installed),
  };
}

/* A catch-all `*` covers every package; a scope's alias is decided per package. */
function shadowsInstalled(entry: AliasEntry, installed: InstalledPackages): boolean {
  if (entry.prefix === "") return true;
  if (entry.wildcard && scopeOf(entry.prefix) !== undefined) return false;
  const name = packageNameOf(entry.prefix);
  return name !== null && installed.has(name);
}

function toEntries({ baseUrl, paths }: TsconfigPaths): AliasEntry[] {
  const entries: AliasEntry[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf("*");
    const absolute = targets.map((target) => resolve(baseUrl, target));
    entries.push(
      star === -1
        ? { prefix: pattern, suffix: "", wildcard: false, targets: absolute }
        : {
            prefix: pattern.slice(0, star),
            suffix: pattern.slice(star + 1),
            wildcard: true,
            targets: absolute,
          },
    );
  }
  return entries;
}

/** TypeScript picks the single match with the longest prefix before `*`. */
function candidatesOf(
  entries: readonly AliasEntry[],
  specifier: string,
  installed: InstalledPackages,
): string[] {
  let best: AliasEntry | null = null;
  for (const entry of entries) {
    if (!matches(entry, specifier)) continue;
    if (!best || entry.prefix.length > best.prefix.length) best = entry;
  }
  if (!best) return [];
  if (!best.wildcard) return [...best.targets];
  const name = scopeOf(best.prefix) === undefined ? null : packageNameOf(specifier);
  if (name !== null && installed.has(name)) return [];

  const matched = specifier.slice(best.prefix.length, specifier.length - best.suffix.length);
  /* The matched part keeps the specifier's forward slashes: each candidate is named as the system names files. */
  return best.targets.map((target) => normalize(target.replace("*", matched)));
}

function matches(entry: AliasEntry, specifier: string): boolean {
  if (!entry.wildcard) return specifier === entry.prefix;
  return (
    specifier.length >= entry.prefix.length + entry.suffix.length &&
    specifier.startsWith(entry.prefix) &&
    specifier.endsWith(entry.suffix)
  );
}

/**
 * Only a mapping that ends in `*` on both sides translates to a prefix alias;
 * one with a suffix after the wildcard has no equivalent and stays behind. A
 * scope's alias becomes one alias per name it leads to that is not installed.
 */
function toLoaderAlias(
  entries: readonly AliasEntry[],
  installed: InstalledPackages,
): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const entry of entries) {
    const target = entry.targets[0];
    if (!target) continue;
    if (!entry.wildcard) {
      alias[entry.prefix] = target;
    } else if (entry.suffix === "" && target.endsWith("*")) {
      const scope = scopeOf(entry.prefix);
      if (scope === undefined) alias[entry.prefix] = target.slice(0, -1);
      else Object.assign(alias, scopeAliases(scope, target.slice(0, -1), installed));
    }
  }
  return alias;
}
