import { readFileSync, statSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { parseJSON5 } from "confbox";

const log = createLogger("Studio");

/** What a tsconfig declares that its path mapping depends on. */
export interface TsconfigFile {
  /** The configs it extends, in the order it names them. */
  extends: string[];
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextList(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const items: unknown[] = value;
  return items.every((item) => typeof item === "string");
}

function readText(path: string): string | null {
  try {
    /* A pipe or a device in its place would hold the read for good. */
    if (!statSync(path).isFile()) {
      log.warn(`${path} is not a regular file, so its path aliases are ignored`);
      return null;
    }
    return readFileSync(path, "utf-8");
  } catch (err) {
    log.warn(`Could not read ${path}, so its path aliases are ignored`, err);
    return null;
  }
}

/* An entry of another kind is skipped, and the others are followed. */
function extendsOf(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) {
    log.warn(`${path}: "extends" is neither a path nor a list of paths, so it is not followed`);
    return [];
  }
  const entries: unknown[] = value;
  const paths = entries.filter((entry): entry is string => typeof entry === "string");
  if (paths.length < entries.length) {
    log.warn(`${path}: "extends" lists something other than a path, which is skipped`);
  }
  return paths;
}

function pathsOf(value: unknown, path: string): Record<string, string[]> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    log.warn(`${path}: "paths" is not an object, so its path aliases are ignored`);
    return undefined;
  }
  const kept: Array<[string, string[]]> = [];
  for (const [pattern, targets] of Object.entries(value)) {
    if (isTextList(targets)) kept.push([pattern, targets]);
    else
      log.warn(
        `${path}: "paths" maps "${pattern}" to something other than a list of paths, so it is ignored`,
      );
  }
  return Object.fromEntries(kept);
}

function optionsOf(value: unknown, path: string): Pick<TsconfigFile, "baseUrl" | "paths"> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    log.warn(`${path}: "compilerOptions" is not an object, so its path aliases are ignored`);
    return {};
  }
  const { baseUrl } = value;
  const paths = pathsOf(value.paths, path);
  const base = typeof baseUrl === "string" ? baseUrl : undefined;
  if (baseUrl !== undefined && base === undefined) {
    log.warn(`${path}: "baseUrl" is not a path, so its aliases resolve from its own directory`);
  }
  return { ...(base !== undefined && { baseUrl: base }), ...(paths && { paths }) };
}

/**
 * Read the fields of a tsconfig that its path mapping depends on. A field
 * of another shape than TypeScript takes is left out with a warning, as
 * TypeScript reports it, rather than failing the load of the config that
 * reads the mapping.
 *
 * @param path - The tsconfig
 * @returns What it declares; `null` when it cannot be read or parsed
 * @example
 * ```ts
 * readTsconfigFile("/app/tsconfig.json");
 * // → { extends: ["./tsconfig.base.json"], paths: { "@/*": ["./src/*"] } }
 * ```
 */
export function readTsconfigFile(path: string): TsconfigFile | null {
  const text = readText(path);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = parseJSON5(text);
  } catch (err) {
    log.warn(`Could not parse ${path}, so its path aliases are ignored`, err);
    return null;
  }
  if (!isRecord(parsed)) {
    log.warn(`${path} does not hold an object, so its path aliases are ignored`);
    return null;
  }
  return { extends: extendsOf(parsed.extends, path), ...optionsOf(parsed.compilerOptions, path) };
}
