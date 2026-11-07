import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectFramework,
  FRAMEWORK_MARKERS,
  type ListedPackages,
  projectFramework,
} from "@noverax/courier-build/config";
import type { GenerateOptions } from "../apis";
import { type ImportLayout, resolveImportLayout } from "../apis/layout";

/* The frameworks whose package a page alone loads: React and Vue that Vite builds. A server
   framework the package lists too — Express, Fastify, Hono, NestJS — is the one told. */
const PAGE_ALONE: ReadonlySet<string> = new Set(["react", "vue"]);

/* The frameworks that build a page with a server of their own. Every other framework the shared
   list names is a server alone. */
const PAGE_WITH_SERVER: ReadonlySet<string> = new Set([
  "next",
  "nuxt",
  "sveltekit",
  "astro",
  "react-router",
  "remix",
  "solid-start",
  "expo",
]);

/**
 * Whether a page alone loads an import's files: the package they go in is
 * built with React or Vue that Vite builds, beside no server framework, as
 * Courier tells a package's framework by what its package.json lists —
 * the rule the upgrade to the core's entries reads a package's side by
 * too. A server the package lists among its dev dependencies alone — an
 * Express or a Koa for a mock — is not one: the app it builds runs
 * without it, and its page loads the files alone. The barrel's direct
 * caller is then a page's.
 *
 * @param root - The project root
 * @param layout - Where the import's files go
 * @returns Whether a page alone loads them
 * @example
 * ```ts
 * // package.json lists vite and react, and Express among the dev dependencies alone
 * generatedForPageAlone("/app", layout); // true
 * ```
 */
export function generatedForPageAlone(root: string, layout: ImportLayout): boolean {
  const { manifest } = projectFramework(join(root, layout.dir));
  if (manifest === undefined) return false;
  const framework = detectFramework(withoutDevServers(listedIn(manifest)));
  return framework !== undefined && PAGE_ALONE.has(framework.id);
}

/* What the package lists, with each server alone it lists among its dev dependencies left out. */
function withoutDevServers(listed: ListedPackages): ListedPackages {
  const devDependencies = { ...listed.devDependencies };
  for (const { id, marker } of FRAMEWORK_MARKERS) {
    if (!PAGE_ALONE.has(id) && !PAGE_WITH_SERVER.has(id))
      Reflect.deleteProperty(devDependencies, marker);
  }
  return { ...listed, devDependencies };
}

/* What a package.json lists; one that does not parse lists nothing, as Courier reads it. */
function listedIn(manifest: string): ListedPackages {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifest, "utf8"));
  } catch {
    parsed = undefined;
  }
  const field = (name: string): Readonly<Record<string, unknown>> => {
    const value = isObject(parsed) ? parsed[name] : undefined;
    return isObject(value) ? value : {};
  };
  return {
    dependencies: field("dependencies"),
    devDependencies: field("devDependencies"),
    peerDependencies: field("peerDependencies"),
    optionalDependencies: field("optionalDependencies"),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Generation options that say a page alone loads the files, for an import
 * named by its `sourceName`, as the import wizard names it.
 *
 * @param options - The options a request carried
 * @param root - The project root
 * @returns The options, with `pageOnly` where a page alone loads the files
 * @throws {InvalidImportError} When the output directory or the name is refused
 * @example
 * ```ts
 * generateCode(spec, withPageAlone(options, "/app"));
 * ```
 */
export function withPageAlone(options: GenerateOptions, root: string): GenerateOptions {
  if (options.sourceName === undefined) return options;
  const layout = resolveImportLayout(options, options.sourceName);
  return generatedForPageAlone(root, layout) ? { ...options, pageOnly: true } : options;
}
