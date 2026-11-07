import type { Project } from "@noverax/create-courier/engine";

import { isRecord } from "../../util/is-record";
import { type AstNode, isNode } from "../codemod/ast";
import { stringOf } from "../codemod/literals";
import { bare, configObject, propertyOf, spreads } from "./config-objects";

/** The root Expo's config gives Expo Router's routes, as written: a path, none, or what of the config is not data the upgrade reads. */
export type ConfiguredRoot =
  | { readonly root: string | undefined }
  | { readonly file: string; readonly unread: string };

/* Expo's configs of code, which it runs. */
const CONFIGS = ["ts", "mts", "cts", "js", "mjs", "cjs"].map(
  (extension) => `app.config.${extension}`,
);

/* The root an object's `plugins` gives expo-router — the static config's where it spreads that — or what of it is not data. */
function rootIn(
  config: AstNode,
  statics: () => string | undefined,
): { readonly root: string | undefined } | { readonly unread: string } {
  const expo = bare(propertyOf(config, "expo"));
  if (isNode(expo) && expo.type === "ObjectExpression") return rootIn(expo, statics);
  const plugins = bare(propertyOf(config, "plugins"));
  if (plugins === undefined) return { root: spreads(config.properties) ? statics() : undefined };
  if (!isNode(plugins) || plugins.type !== "ArrayExpression") return { unread: "its plugins" };
  for (const element of Array.isArray(plugins.elements) ? plugins.elements.map(bare) : []) {
    const listed = isNode(element) && element.type === "ArrayExpression";
    const [name, options] =
      listed && Array.isArray(element.elements) ? element.elements.map(bare) : [element];
    if (stringOf(name) !== "expo-router") continue;
    if (options === undefined) return { root: undefined };
    if (!isNode(options) || options.type !== "ObjectExpression")
      return { unread: "its expo-router options" };
    const root = bare(propertyOf(options, "root"));
    if (root === undefined) return { root: undefined };
    const written = stringOf(root);
    if (written !== undefined) return { root: written };
    return { unread: "its expo-router root" };
  }
  return { root: spreads(plugins.elements) ? statics() : undefined };
}

/* The root app.json gives expo-router's plugin. */
function staticRoot(project: Project): string | undefined {
  let config: unknown;
  try {
    config = JSON.parse(project.read("app.json") ?? "null");
  } catch {
    return undefined;
  }
  const expo = isRecord(config) && isRecord(config.expo) ? config.expo : config;
  const plugins = isRecord(expo) && Array.isArray(expo.plugins) ? expo.plugins : [];
  for (const plugin of plugins) {
    const options: unknown = Array.isArray(plugin) && plugin[0] === "expo-router" ? plugin[1] : {};
    if (isRecord(options) && typeof options.root === "string") return options.root;
  }
  return undefined;
}

/**
 * The folder Expo's config gives Expo Router's routes, read without
 * running it: app.json's plugin, or an `app.config.*` whose default
 * export is an object, or a function that returns one, written as data —
 * `plugins` with `["expo-router", { root: "./src/routes" }]` — the
 * static config's where it spreads it. A config that is not written so
 * is named, with what of it is not.
 *
 * @param project - The app's package
 * @returns The root as written, none where the config names none, or what is not read
 * @example
 * ```ts
 * configuredRoot(project); // { root: "./src/routes" }
 * ```
 */
export function configuredRoot(project: Project): ConfiguredRoot {
  const config = configObject(project, CONFIGS);
  if (config === undefined) return { root: staticRoot(project) };
  if ("unread" in config) return config;
  const found = rootIn(config.object, () => staticRoot(project));
  return "unread" in found ? { file: config.file, unread: found.unread } : found;
}
