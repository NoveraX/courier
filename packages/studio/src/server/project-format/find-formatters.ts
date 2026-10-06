import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { isRecord } from "../mocks-edit/is-record";
import { parseJsonc } from "../mocks-edit/parse-jsonc";
import { biomeCommand, type ToolCommand } from "./biome-binary";
import {
  BIOME_CONFIGS,
  declares,
  ESLINT_CONFIGS,
  filesStamp,
  manifestWith,
  nearest,
  PRETTIER_CONFIGS,
  readManifest,
} from "./formatter-configs";
import { installedPackage, packageEntry } from "./installed-package";

const log = createLogger("Studio");

/** A tool that formats or fixes the project's code, as the project installed it. */
export type FormatterTool =
  /** Biome, run as its own program on each file. */
  | { name: "Biome"; version: string; command: ToolCommand }
  /** ESLint or Prettier, loaded once from the module the project resolves. */
  | { name: "ESLint" | "Prettier"; version: string; module: string };

/** The tools a project formats its code with, in the order they run. */
export interface ProjectFormatters {
  /** Biome first, then ESLint's fixes, then Prettier where it formats what Biome does not. */
  tools: FormatterTool[];
  /** A tool the project configures that Studio cannot run, and why. */
  missing: string | null;
  /** The configurations the tools read, as they are now: a formatter kept warm on older ones starts again. */
  stamp: string;
}

/**
 * Find the tools a project formats its code with. Biome, when a
 * `biome.json` stands in the project or a folder above it or its package
 * declares Biome: it sorts the imports and formats. ESLint, when an ESLint
 * configuration does: its fixes apply, by the project's own rules.
 * Prettier, when a Prettier configuration does or the package declares it:
 * it formats last, alone or after Biome when Biome's formatter is off. A
 * project with none of them gets its files as Studio writes them.
 *
 * @param root - The project root, symlinks resolved
 * @returns The tools to run, none when the project uses none
 * @example
 * ```ts
 * findFormatters("/app").tools.map((tool) => tool.name); // → ["Biome", "ESLint"]
 * ```
 */
export function findFormatters(root: string): ProjectFormatters {
  const manifestPath = join(root, "package.json");
  const manifest = readManifest(manifestPath);
  const biomeConfig = nearest(root, BIOME_CONFIGS);
  const eslintConfig = nearest(root, ESLINT_CONFIGS) ?? manifestWith(root, "eslintConfig");
  const prettierConfig = nearest(root, PRETTIER_CONFIGS) ?? manifestWith(root, "prettier");
  const usesBiome = biomeConfig !== null || declares(manifest, "@biomejs/biome");
  const usesPrettier = prettierConfig !== null || declares(manifest, "prettier");
  const prettierRuns = usesPrettier && (!usesBiome || !biomeFormats(biomeConfig));
  const wanted: Array<[FormatterTool["name"], boolean]> = [
    ["Biome", usesBiome],
    ["ESLint", eslintConfig !== null],
    ["Prettier", prettierRuns],
  ];
  const found = wanted.map(([name, used]) => (used ? { name, tool: toolOf(root, name) } : null));
  const tools = found.flatMap((entry) => (entry?.tool ? [entry.tool] : []));
  const absent = found.find((entry) => entry !== null && entry.tool === null);
  const configs = [biomeConfig, eslintConfig, prettierConfig, manifestPath];
  const versions = tools.map((tool) => `${tool.name} ${tool.version}`).join(",");
  return {
    tools,
    missing: absent ? `${absent.name} is configured but not installed` : null,
    stamp: `${versions}|${filesStamp(configs.filter((path): path is string => path !== null))}`,
  };
}

/* The tool as the project installed it, or `null` when it did not. */
function toolOf(root: string, name: FormatterTool["name"]): FormatterTool | null {
  if (name === "Biome") {
    const biome = installedPackage(root, "@biomejs/biome");
    const command = biome && biomeCommand(biome);
    return biome && command ? { name, version: biome.version, command } : null;
  }
  const pkg = installedPackage(root, name === "ESLint" ? "eslint" : "prettier");
  const module = pkg && packageEntry(root, name === "ESLint" ? "eslint" : "prettier");
  return pkg && module ? { name, version: pkg.version, module } : null;
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
