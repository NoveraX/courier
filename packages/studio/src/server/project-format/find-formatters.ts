import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import { isRecord } from "../mocks-edit/is-record";
import { parseJsonc } from "../mocks-edit/parse-jsonc";

const log = createLogger("Studio");

const BIOME_CONFIGS = ["biome.json", "biome.jsonc"];
const PRETTIER_CONFIGS = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.ts",
  ".prettierrc.cts",
  ".prettierrc.mts",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
  "prettier.config.cts",
  "prettier.config.mts",
];

/** A formatter the project uses, as installed in it. */
export interface FormatterTool {
  /** The tool, as Studio names it to the user. */
  name: "Biome" | "Prettier";
  /** The installed version. */
  version: string;
  /** The script the package runs its command line with. */
  bin: string;
}

/** The formatters a project uses, in the order they run. */
export interface ProjectFormatters {
  /** Each tool, in order: Biome first, then Prettier where it formats what Biome does not. */
  tools: FormatterTool[];
  /** A tool the project configures that Studio cannot run, and why. */
  missing: string | null;
}

/**
 * Find the formatters a project uses: Biome, when a `biome.json` stands in
 * the project or a folder above it or its package declares Biome; Prettier,
 * when a Prettier configuration does or its package declares Prettier.
 * Each runs as the project installed it. Biome sorts the imports and
 * formats; Prettier runs after it only when Biome's formatter is off, or
 * alone where the project has no Biome.
 *
 * @param root - The project root, symlinks resolved
 * @returns The tools to run, none when the project formats with neither
 * @example
 * ```ts
 * findFormatters("/app").tools.map((tool) => tool.name); // → ["Biome"]
 * ```
 */
export function findFormatters(root: string): ProjectFormatters {
  const manifest = readManifest(join(root, "package.json"));
  const biomeConfig = nearest(root, BIOME_CONFIGS);
  const usesBiome = biomeConfig !== null || declares(manifest, "@biomejs/biome");
  const usesPrettier =
    nearest(root, PRETTIER_CONFIGS) !== null ||
    manifestDeclaresPrettier(root) ||
    declares(manifest, "prettier");
  const biome = usesBiome ? installed(root, "@biomejs/biome", "biome", "Biome") : null;
  const prettierRuns = usesPrettier && (!usesBiome || !biomeFormats(biomeConfig));
  const prettier = prettierRuns ? installed(root, "prettier", "prettier", "Prettier") : null;
  const tools = [biome, prettier].filter((tool): tool is FormatterTool => tool !== null);
  const missing =
    usesBiome && biome === null
      ? "Biome is configured but not installed"
      : prettierRuns && prettier === null
        ? "Prettier is configured but not installed"
        : null;
  return { tools, missing };
}

/* The first file of these names in the folder or one above it. */
function nearest(from: string, names: readonly string[]): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    for (const name of names) {
      if (existsSync(join(dir, name))) return join(dir, name);
    }
    if (dirname(dir) === dir) return null;
  }
}

/* A `prettier` key in a package.json in the folder or one above it. */
function manifestDeclaresPrettier(from: string): boolean {
  for (let dir = from; ; dir = dirname(dir)) {
    const manifest = readManifest(join(dir, "package.json"));
    if (manifest !== null && Object.hasOwn(manifest, "prettier")) return true;
    if (dirname(dir) === dir) return false;
  }
}

function declares(manifest: Record<string, unknown> | null, name: string): boolean {
  if (manifest === null) return false;
  return ["dependencies", "devDependencies"].some((field) => {
    const deps = manifest[field];
    return isRecord(deps) && Object.hasOwn(deps, name);
  });
}

/* Whether Biome formats JavaScript, as the configuration found says; on when it says nothing. */
function biomeFormats(config: string | null): boolean {
  if (config === null) return true;
  let value: unknown;
  try {
    value = parseJsonc(readFileSync(config, "utf8"));
  } catch (error) {
    log.debug(`${config} does not parse; Biome is taken to format`, error);
    return true;
  }
  const off = (section: unknown): boolean =>
    isRecord(section) && isRecord(section.formatter) && section.formatter.enabled === false;
  return !(isRecord(value) && (off(value) || off(value.javascript)));
}

/* The package as the project installed it: its version and the script its command runs. */
function installed(
  root: string,
  pkg: string,
  command: string,
  name: FormatterTool["name"],
): FormatterTool | null {
  let manifestPath: string;
  try {
    manifestPath = createRequire(join(root, "package.json")).resolve(`${pkg}/package.json`);
  } catch (error) {
    log.debug(`${pkg} does not resolve from ${root}`, error);
    return null;
  }
  const manifest = readManifest(manifestPath);
  const bin = manifest?.bin;
  const script = typeof bin === "string" ? bin : isRecord(bin) ? bin[command] : undefined;
  if (typeof script !== "string" || typeof manifest?.version !== "string") return null;
  return { name, version: manifest.version, bin: join(dirname(manifestPath), script) };
}

function readManifest(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(value) ? value : null;
  } catch (error) {
    log.debug(`${path} is not JSON`, error);
    return null;
  }
}
