import type { Project } from "@noverax/create-courier/engine";

import { type AstNode, isNode } from "../codemod/ast";
import { bare, configObject, propertyOf, spreads } from "./config-objects";
import { type ConfigPath, type PathNames, pathNames, pathOf } from "./config-paths";

/** Where a package's Vite config says its page starts, read without running it: its root and its input as written — none where it names neither, or there is no config — or what of the config is not data the upgrade reads. */
export type ViteStart =
  | {
      readonly file: string | undefined;
      readonly root: string | undefined;
      readonly input: readonly ConfigPath[] | undefined;
    }
  | { readonly file: string; readonly unread: string };

/* Vite's configs, in the order Vite 8 looks for one. */
const CONFIGS = ["js", "mjs", "ts", "cjs", "mts", "cts"].map(
  (extension) => `vite.config.${extension}`,
);

/* An object literal, written with no spread that may hold more: a config's, its `build`, its bundler's options. */
function plainObject(node: unknown): AstNode | undefined {
  const value = bare(node);
  if (!isNode(value) || value.type !== "ObjectExpression") return undefined;
  return spreads(value.properties) ? undefined : value;
}

/* The paths an input names as data: a path, a list of them, or an object of them; none where it is not written so. */
function pathsOf(node: unknown, names: PathNames): ConfigPath[] | undefined {
  const value = bare(node);
  const single = pathOf(value, names);
  if (single !== undefined) return [single];
  const listed = isNode(value) && value.type === "ArrayExpression" ? value.elements : undefined;
  const named = plainObject(value)?.properties;
  const items = Array.isArray(listed) ? listed : Array.isArray(named) ? named : undefined;
  if (items === undefined || items.length === 0) return undefined;
  const paths = items.map((each) =>
    pathOf(isNode(each) && each.type === "Property" ? each.value : each, names),
  );
  return paths.every((each): each is ConfigPath => each !== undefined) ? paths : undefined;
}

/**
 * Where a package's Vite config says its page starts, read without
 * running it, as Vite 8 takes it: `root`, and the input of
 * `build.rolldownOptions` — or of `build.rollupOptions`, its older name,
 * where that is not written — else the config's own `input`. Each is
 * data where it is a path — a string, or one `resolve()`, `join()` or
 * `fileURLToPath()` makes from the config's own folder and strings — or
 * an input's list or object of paths; a
 * config that is not data, or spreads another into the object that
 * holds them, is named, with what of it is not.
 *
 * @param project - The page's package
 * @returns The root and the input as written, or what is not read
 * @example
 * ```ts
 * viteStart(project); // { file: "vite.config.ts", root: "web", input: ["./index.html"] }
 * ```
 */
export function viteStart(project: Project): ViteStart {
  const config = configObject(project, CONFIGS);
  if (config === undefined) return { file: undefined, root: undefined, input: undefined };
  if ("unread" in config) return config;
  const { file } = config;
  const names = pathNames(config.program);
  const object = plainObject(config.object);
  if (object === undefined) return { file, unread: "its default export" };
  const written = propertyOf(object, "root");
  const root = written === undefined ? undefined : pathOf(written, names)?.path;
  if (written !== undefined && root === undefined) return { file, unread: "its root" };
  const build = propertyOf(object, "build");
  const options = build === undefined ? undefined : plainObject(build);
  if (build !== undefined && options === undefined) return { file, unread: "its build" };
  const bundler = ["rolldownOptions", "rollupOptions"].find(
    (key) => options !== undefined && propertyOf(options, key) !== undefined,
  );
  const bundled =
    bundler === undefined || options === undefined ? undefined : propertyOf(options, bundler);
  const held = bundled === undefined ? undefined : plainObject(bundled);
  if (bundled !== undefined && held === undefined) return { file, unread: `its build.${bundler}` };
  const [where, input] =
    held !== undefined && propertyOf(held, "input") !== undefined
      ? [`its build.${bundler}.input`, propertyOf(held, "input")]
      : ["its input", propertyOf(object, "input")];
  if (input === undefined) return { file, root, input: undefined };
  const paths = pathsOf(input, names);
  return paths === undefined ? { file, unread: where } : { file, root, input: paths };
}
