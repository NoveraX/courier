import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { isRecord } from "./is-record";
import { readTsconfig } from "./read-tsconfig";

const log = createLogger("Studio");

/** The compiler options that decide how TypeScript resolves an import. */
export interface ModuleOptions {
  module?: string;
  moduleResolution?: string;
}

/**
 * The `module` and `moduleResolution` a tsconfig sets, merged down the chain
 * of configs it extends as TypeScript merges them: a later entry of an
 * `extends` array over an earlier one, and the tsconfig's own options over
 * both. Each extended config brings the whole chain it extends in turn.
 *
 * An extended config that cannot be found, read or parsed sets nothing, and
 * a chain that comes back to a config it passed through ends there.
 *
 * @param file - The tsconfig's path, which its `extends` resolve against
 * @param config - The tsconfig as {@link readTsconfig} read it
 * @returns The two options, each absent when no config in the chain sets it
 * @example
 * ```ts
 * // /app/base.json: { "compilerOptions": { "module": "NodeNext" } }
 * tsconfigModuleOptions("/app/tsconfig.json", { extends: "./base.json" });
 * // → { module: "NodeNext" }
 * ```
 */
export function tsconfigModuleOptions(
  file: string,
  config: Record<string, unknown>,
): ModuleOptions {
  return chainOptions(file, config, new Set([file]));
}

/* `chain` holds the configs between the tsconfig and this one, not every
   config read: two entries of an `extends` array may share a base, and each
   brings its options again. */
function chainOptions(
  file: string,
  config: Record<string, unknown>,
  chain: ReadonlySet<string>,
): ModuleOptions {
  const merged: ModuleOptions = {};
  for (const specifier of extendsOf(config)) {
    Object.assign(merged, extendedOptions(resolveExtends(specifier, dirname(file)), chain));
  }
  return Object.assign(merged, ownOptions(config.compilerOptions));
}

function extendedOptions(file: string | null, chain: ReadonlySet<string>): ModuleOptions {
  if (file === null || chain.has(file)) return {};
  const config = readTsconfig(file);
  return config === null ? {} : chainOptions(file, config, new Set([...chain, file]));
}

function extendsOf(config: Record<string, unknown>): string[] {
  const value = config.extends;
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  const items: unknown[] = value;
  return items.filter((item): item is string => typeof item === "string");
}

function ownOptions(options: unknown): ModuleOptions {
  if (!isRecord(options)) return {};
  const own: ModuleOptions = {};
  if (typeof options.module === "string") own.module = options.module;
  if (typeof options.moduleResolution === "string") {
    own.moduleResolution = options.moduleResolution;
  }
  return own;
}

/* An `extends` names a file, a directory holding a `tsconfig.json`, or an
   installed package that ships one. */
function resolveExtends(specifier: string, fromDir: string): string | null {
  if (!specifier.startsWith(".") && !isAbsolute(specifier)) {
    return resolvePackageConfig(specifier, fromDir);
  }
  const candidate = resolve(fromDir, specifier);
  if (!existsSync(candidate)) return existsSync(`${candidate}.json`) ? `${candidate}.json` : null;
  if (!statSync(candidate).isDirectory()) return candidate;
  const nested = resolve(candidate, "tsconfig.json");
  return existsSync(nested) ? nested : null;
}

/* The package's own entry counts only when it is JSON; its `tsconfig.json`
   is tried next, as TypeScript does. */
function resolvePackageConfig(specifier: string, fromDir: string): string | null {
  const requireFrom = createRequire(resolve(fromDir, "tsconfig.json"));
  for (const target of [specifier, `${specifier}/tsconfig.json`]) {
    try {
      const resolved = requireFrom.resolve(target);
      if (resolved.endsWith(".json")) return resolved;
    } catch (err) {
      log.debug(`${target} does not resolve from ${fromDir}`, err);
    }
  }
  return null;
}
