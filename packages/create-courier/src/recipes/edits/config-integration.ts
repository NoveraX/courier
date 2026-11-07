import { type CodeStyle, namedImport } from "../../edit/code-style";
import { addToConfigList } from "../../edit/config-list";
import { importsOf, usesExport } from "../../edit/imports";
import { scanSource } from "../../edit/source-scan";
import type { Project } from "../../project/read-project";
import type { RecipeEdit } from "../recipe-types";

/**
 * The first of some files the project has.
 *
 * @param project - The project
 * @param paths - The candidates, in order
 * @param fallback - The file named where none is there: the first candidate, unless another is given
 * @returns The first that exists; the fallback when none does
 * @example
 * ```ts
 * firstExisting(project, ["vite.config.ts", "vite.config.js"]); // "vite.config.js" in a JavaScript config
 * ```
 */
export function firstExisting(
  project: Project,
  paths: readonly string[],
  fallback = paths[0] ?? "",
): string {
  return paths.find((path) => project.exists(path)) ?? fallback;
}

/** The names a Vite config may have, in the order Vite 8 looks for them: of two, the one it reads comes first. */
export const VITE_CONFIGS = ["js", "mjs", "ts", "cjs", "mts", "cts"].map(
  (extension) => `vite.config.${extension}`,
);
/** The Vite config the setup names where a project has none. */
export const VITE_CONFIG = "vite.config.ts";

/** The names an Rsbuild config may have, in the order Rsbuild 2 looks for them: of two, the one it reads comes first. */
export const RSBUILD_CONFIGS = ["ts", "js", "mts", "mjs", "cts", "cjs"].map(
  (extension) => `rsbuild.config.${extension}`,
);

/**
 * Whether Rsbuild builds the app rather than Vite: its config is there,
 * or the app lists `@rsbuild/core` and not Vite.
 *
 * @param project - The project
 * @returns Whether it does
 * @example
 * ```ts
 * buildsWithRsbuild(project); // true in a TanStack Start app made with `--build-tool rsbuild`
 * ```
 */
export function buildsWithRsbuild(project: Project): boolean {
  return (
    RSBUILD_CONFIGS.some((path) => project.exists(path)) ||
    (project.lists("@rsbuild/core") && !project.lists("vite"))
  );
}

/** The names an Astro config may have. */
export const ASTRO_CONFIGS = [
  "astro.config.mjs",
  "astro.config.ts",
  "astro.config.mts",
  "astro.config.js",
];

/** The names a Nuxt config may have. */
export const NUXT_CONFIGS = ["nuxt.config.ts", "nuxt.config.mts", "nuxt.config.js"];

/** An integration of Courier's that a config file lists — a plugin, a module — where, and under what name. */
export interface Integration {
  readonly path: string;
  readonly purpose: string;
  /** What the person does where the command cannot, in a sentence. */
  readonly what: string;
  readonly callees: readonly string[];
  readonly property: string;
  readonly name: string;
  /** The item in the list: the integration called, or the module named. */
  readonly item: string;
  readonly from: string;
  /** Other modules whose export of the name does the same: Studio's entry of another framework. */
  readonly also?: readonly string[];
}

/* The config with the integration in its list — unless its code uses it already — and imported where it is not. */
function withIntegration(text: string, integration: Integration): string | undefined {
  const { callees, property, name, item, from, also = [] } = integration;
  const scan = scanSource(text);
  if (scan === undefined) return undefined;
  const imports = importsOf(scan);
  const ours = (specifier: string) => specifier === from || also.includes(specifier);
  if (usesExport(scan, imports, ours, name, item.endsWith(")"))) return text;
  const imported = imports.some(
    (each) =>
      ours(each.specifier) &&
      each.bindings.some((binding) => binding.imported === name && binding.local === name),
  );
  return addToConfigList(text, {
    callees,
    property,
    item: () => item,
    ...(imported
      ? {}
      : { importLine: (fileStyle: CodeStyle) => namedImport(fileStyle, [name], from) }),
  });
}

/**
 * The edit that adds an integration to the list its config keeps them in,
 * imported where the config does not import it yet; the lines to add,
 * where the config's shape is not one the edit knows.
 *
 * @param integration - The integration, its list and its config
 * @returns The edit
 * @example
 * ```ts
 * integrationEdit({ path: "vite.config.ts", purpose: "…", what: "…", callees: ["defineConfig"], property: "plugins", name: "courierRoutes", item: "courierRoutes()", from: "@noverax/courier-sveltekit/plugin" });
 * ```
 */
export function integrationEdit(integration: Integration): RecipeEdit {
  const { path, purpose, what, property, name, item, from } = integration;
  const style = { quote: '"', semi: true } as const;
  return {
    path,
    purpose,
    change: (text) => withIntegration(text, integration),
    manual: {
      file: path,
      what,
      lines: [namedImport(style, [name], from), `${property}: [${item}],`],
    },
  };
}
