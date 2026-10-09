import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isRecord } from "../is-record";

/** What the command reads of a project's package.json. */
export interface PackageManifest {
  name?: string | undefined;
  type?: string | undefined;
  dependencies: Readonly<Record<string, string>>;
  devDependencies: Readonly<Record<string, string>>;
  scripts: Readonly<Record<string, string>>;
}

/** A project the command sets Courier up in. */
export interface Project {
  /** Its folder. */
  readonly root: string;
  readonly manifest: PackageManifest;
  /** Whether the project lists a package, as a dependency or a dev dependency. */
  lists(name: string): boolean;
  /** A package's version as installed, else the lowest its range in the manifest allows. */
  version(name: string): string | undefined;
  /** A package's version as installed, else its range in the manifest, as the person wrote it. */
  shown(name: string): string | undefined;
  /** Whether a path inside the project exists. */
  exists(path: string): boolean;
  /** A file inside the project, as text, when it is there. */
  read(path: string): string | undefined;
}

function strings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * The fields of a package.json the command reads, each checked for its
 * shape: a field of another shape reads as missing.
 *
 * @param text - The package.json's text
 * @param path - Where it is, for the error
 * @returns The manifest
 * @throws {Error} When the text is not a JSON object
 * @example
 * ```ts
 * manifestOf('{ "dependencies": { "next": "16.4.0" } }', "package.json").dependencies.next; // "16.4.0"
 * ```
 */
export function manifestOf(text: string, path: string): PackageManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) throw new Error(`${path} does not hold a JSON object`);
  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    type: typeof parsed.type === "string" ? parsed.type : undefined,
    dependencies: strings(parsed.dependencies),
    devDependencies: strings(parsed.devDependencies),
    scripts: strings(parsed.scripts),
  };
}

/* The lowest version a range allows, near enough to tell its major: "^5" → "5", ">=6.0.2" → "6.0.2". */
function lowestOf(range: string): string | undefined {
  return /\d+(?:\.\d+){0,2}/.exec(range)?.[0];
}

/**
 * The project at a folder, read from its package.json.
 *
 * @param root - The project's folder
 * @returns The project
 * @throws {Error} When the folder has no package.json, or one that is not a JSON object
 * @example
 * ```ts
 * readProject("/work/shop").lists("next"); // true in a Next.js app
 * ```
 */
export function readProject(root: string): Project {
  const manifestPath = join(root, "package.json");
  if (!existsSync(manifestPath)) throw new Error(`There is no package.json in ${root}`);
  const manifest = manifestOf(readFileSync(manifestPath, "utf8"), manifestPath);
  const listed = (name: string) => manifest.dependencies[name] ?? manifest.devDependencies[name];
  const exists = (path: string) => existsSync(join(root, path));
  const installed = (name: string) => {
    const path = join(root, "node_modules", name, "package.json");
    if (!existsSync(path)) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) && typeof parsed.version === "string" ? parsed.version : undefined;
  };
  return {
    root,
    manifest,
    lists: (name) => listed(name) !== undefined,
    version(name) {
      const range = listed(name);
      return installed(name) ?? (range === undefined ? undefined : lowestOf(range));
    },
    shown: (name) => installed(name) ?? listed(name),
    exists,
    read: (path) => (exists(path) ? readFileSync(join(root, path), "utf8") : undefined),
  };
}

/**
 * The major of a version.
 *
 * @param version - A version, such as `5.9.3`
 * @returns Its major, or `undefined` when it has none
 * @example
 * ```ts
 * majorOf("16.4.0"); // 16
 * ```
 */
export function majorOf(version: string | undefined): number | undefined {
  const major = Number.parseInt(version ?? "", 10);
  return Number.isNaN(major) ? undefined : major;
}
