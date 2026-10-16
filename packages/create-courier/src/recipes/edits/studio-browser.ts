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
 * @returns The first that exists; the first candidate when none does
 * @example
 * ```ts
 * firstExisting(project, ["vite.config.ts", "vite.config.js"]); // "vite.config.js" in a JavaScript config
 * ```
 */
export function firstExisting(project: Project, paths: readonly string[]): string {
  return paths.find((path) => project.exists(path)) ?? paths[0] ?? "";
}

/** A Studio integration that a config file lists: where, and under what name. */
interface Integration {
  readonly path: string;
  readonly purpose: string;
  readonly callees: readonly string[];
  readonly property: string;
  readonly name: string;
  /** The item in the list: the integration called, or the module named. */
  readonly item: string;
  readonly from: string;
  /** Other entries of Studio's whose integration connects the browser too: Vite's own, for an app Vite serves. */
  readonly also?: readonly string[];
}

/* The config with the integration in its list — unless its code uses it already — and imported where it is not. */
function withIntegration(text: string, integration: Integration): string | undefined {
  const { callees, property, name, item, from, also = [] } = integration;
  const scan = scanSource(text);
  if (scan === undefined) return undefined;
  const imports = importsOf(scan);
  const studio = (specifier: string) => specifier === from || also.includes(specifier);
  if (usesExport(scan, imports, studio, name, item.endsWith(")"))) return text;
  const imported = imports.some(
    (each) =>
      studio(each.specifier) &&
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

function integrationEdit(integration: Integration): RecipeEdit {
  const { path, purpose, property, name, item, from } = integration;
  const style = { quote: '"', semi: true } as const;
  return {
    path,
    purpose,
    change: (text) => withIntegration(text, integration),
    manual: {
      file: path,
      what: `Connect the browser to Studio: add ${item} to the config's ${property}`,
      lines: [namedImport(style, [name], from), `${property}: [${item}],`],
    },
  };
}

/* Studio's entries whose `courierStudio()` is Vite's plugin. */
const VITE_ENTRIES = ["vite", "react", "vue", "sveltekit", "remix", "solid"];

const VITE_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

/**
 * The edit that connects the browser to Studio in an app Vite serves:
 * `courierStudio()` in the config's `plugins`, from the framework's entry
 * of `@noverax/courier-studio`.
 *
 * @param project - The project
 * @param entry - The framework's entry: `react`, `sveltekit`, `remix`, `solid`, `vue`
 * @returns The edit
 * @example
 * ```ts
 * viteStudioEdit(project, "react").path; // "vite.config.ts"
 * ```
 */
export function viteStudioEdit(project: Project, entry: string): RecipeEdit {
  return integrationEdit({
    path: firstExisting(project, VITE_CONFIGS),
    purpose: "connects the browser to Studio while you develop",
    callees: ["defineConfig"],
    property: "plugins",
    name: "courierStudio",
    item: "courierStudio()",
    from: `@noverax/courier-studio/${entry}`,
    also: VITE_ENTRIES.map((each) => `@noverax/courier-studio/${each}`),
  });
}

/**
 * The edit that connects Astro's pages to Studio: `courierStudio()` in the
 * config's `integrations`.
 *
 * @param project - The project
 * @returns The edit
 * @example
 * ```ts
 * astroStudioEdit(project).path; // "astro.config.mjs"
 * ```
 */
export function astroStudioEdit(project: Project): RecipeEdit {
  const configs = ["astro.config.mjs", "astro.config.ts", "astro.config.mts", "astro.config.js"];
  return integrationEdit({
    path: firstExisting(project, configs),
    purpose: "connects the pages to Studio while you develop",
    callees: ["defineConfig"],
    property: "integrations",
    name: "courierStudio",
    item: "courierStudio()",
    from: "@noverax/courier-studio/astro",
  });
}

/**
 * The edit that connects a Nuxt app's pages to Studio: Studio's module in
 * the config's `modules`.
 *
 * @param project - The project
 * @returns The edit
 * @example
 * ```ts
 * nuxtStudioEdit(project).path; // "nuxt.config.ts"
 * ```
 */
export function nuxtStudioEdit(project: Project): RecipeEdit {
  return integrationEdit({
    path: firstExisting(project, ["nuxt.config.ts", "nuxt.config.mts", "nuxt.config.js"]),
    purpose: "connects the pages to Studio while you develop",
    callees: ["defineNuxtConfig"],
    property: "modules",
    name: "courierStudioModule",
    item: "courierStudioModule",
    from: "@noverax/courier-studio/nuxt",
  });
}
