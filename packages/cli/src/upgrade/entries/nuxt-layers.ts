import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

import { isRecord } from "../../util/is-record";
import { type AstNode, isNode, nameOf } from "../codemod/ast";
import { parseCode } from "../codemod/oxc-parse";

/** The layers of a workspace's Nuxt apps, and the configs whose layers could not be read. */
export interface NuxtLayers {
  /** Each folder Nuxt reads as a layer of an app's, relative to the workspace's root. */
  readonly folders: readonly string[];
  /** Each config whose `extends` is not data, relative to the root: what it names is read without Nuxt's rules. */
  readonly unread: readonly string[];
}

const CONFIGS = ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs", "nuxt.config.mts"];
/* How deep layers that extend layers are followed. */
const DEPTH = 8;
/* The largest config read for its layers, in bytes. */
const CONFIG_BYTES = 256 * 1024;
/* A layer Nuxt downloads: `github:`, `gitlab:`, an address. */
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const within = (folder: string, name: string) => (folder === "" ? name : `${folder}/${name}`);

/* The config of a folder Nuxt reads as an app or a layer, relative to the workspace's root. */
function configOf(root: string, folder: string): string | undefined {
  return CONFIGS.map((name) => within(folder, name)).find((path) => existsSync(join(root, path)));
}

/* The folders of a folder, none where it is not there. */
function subfolders(root: string, folder: string): string[] {
  try {
    return readdirSync(join(root, folder), { withFileTypes: true })
      .filter((each) => each.isDirectory())
      .map((each) => each.name);
  } catch {
    return [];
  }
}

/* The items of a node's list, none where it has none. */
function listOf(node: unknown, key: string): unknown[] {
  const list = isNode(node) ? node[key] : undefined;
  return Array.isArray(list) ? list : [];
}

/* A string a config writes: a literal's, or a template's with no insertion. */
function stringOf(node: unknown): string | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined;
  const [only, ...more] = node.type === "TemplateLiteral" ? listOf(node, "quasis") : [];
  const cooked = isNode(only) && isRecord(only.value) ? only.value.cooked : undefined;
  return more.length === 0 && typeof cooked === "string" ? cooked : undefined;
}

/* The object a config's default export gives Nuxt: itself, or what defineNuxtConfig() is called with. */
function configObject(program: unknown): AstNode | undefined {
  const exported = listOf(program, "body")
    .filter(isNode)
    .find((each) => each.type === "ExportDefaultDeclaration")?.declaration;
  if (!isNode(exported) || exported.type === "ObjectExpression")
    return isNode(exported) ? exported : undefined;
  const [first] = exported.type === "CallExpression" ? listOf(exported, "arguments") : [];
  return isNode(first) && first.type === "ObjectExpression" ? first : undefined;
}

/* The layers a config's `extends` names as it writes them: none where it names none, `undefined` where it is not data. */
function extendsOf(file: string, text: string): string[] | undefined {
  if (!/\bextends\b/.test(text)) return [];
  const parsed = parseCode(file, text);
  const config = parsed.errors.length > 0 ? undefined : configObject(parsed.program);
  if (config === undefined) return undefined;
  const properties = listOf(config, "properties").filter(isNode);
  const named = properties.find(
    (each) =>
      each.type === "Property" &&
      each.computed !== true &&
      (stringOf(each.key) ?? nameOf(each.key)) === "extends",
  );
  if (named === undefined)
    return properties.some((each) => each.type === "SpreadElement") ? undefined : [];
  const single = stringOf(named.value);
  if (single !== undefined) return [single];
  if (!isNode(named.value) || named.value.type !== "ArrayExpression") return undefined;
  const names: string[] = [];
  for (const element of listOf(named.value, "elements")) {
    const tuple = isNode(element) && element.type === "ArrayExpression";
    const name = stringOf(tuple ? listOf(element, "elements")[0] : element);
    if (name === undefined) return undefined;
    names.push(name);
  }
  return names;
}

/* The folder an entry of `extends` names, relative to the workspace's root: a path from the config's folder, one Nuxt's aliases give from the app's root, or a package of the workspace by its name; none for a layer Nuxt downloads, or one out of the workspace. */
function layerFolder(
  root: string,
  app: string,
  config: string,
  name: string,
  members: ReadonlyMap<string, string>,
): string | undefined {
  if (REMOTE.test(name)) return undefined;
  const fromApp = (rest: string) => posix.join(app || ".", rest);
  let path: string;
  if (/^(?:~~|@@)\//.test(name)) path = fromApp(name.slice(3));
  else if (/^[~@]\//.test(name))
    path = existsSync(join(root, fromApp(`app/${name.slice(2)}`)))
      ? fromApp(`app/${name.slice(2)}`)
      : fromApp(name.slice(2));
  else if (name.startsWith(".")) path = posix.join(config || ".", name);
  else return name.startsWith("/") ? undefined : members.get(name);
  const plain = posix.normalize(path);
  if (plain === ".." || plain.startsWith("../")) return undefined;
  return plain === "." ? "" : plain;
}

/**
 * The layers of a workspace's Nuxt apps, as Nuxt reads them: each folder
 * under an app's `layers/` that holds a `nuxt.config`, and each local
 * layer a config's `extends` names — a path from the config's folder,
 * one by Nuxt's `~~` and `~` aliases, a package of the workspace by its
 * name — and the layers those extend in turn. A config whose `extends`
 * is not data Courier reads is named; a layer Nuxt downloads has no
 * files in the workspace.
 *
 * @param root - The workspace's folder
 * @param apps - The folders of its Nuxt apps, relative to the root
 * @param members - Its packages by name: their folders
 * @returns The layers' folders, and the configs whose layers were not read
 * @example
 * ```ts
 * nuxtLayers("/work/shop", ["apps/web"], members).folders; // ["apps/web/layers/base", "layers/brand"]
 * ```
 */
export function nuxtLayers(
  root: string,
  apps: readonly string[],
  members: ReadonlyMap<string, string>,
): NuxtLayers {
  const folders = new Set<string>();
  const unread: string[] = [];
  /* A folder a layer is: one, or the one a config path names. */
  const folderOf = (path: string) => {
    if (!existsSync(join(root, path))) return undefined;
    return statSync(join(root, path)).isDirectory()
      ? path
      : posix.dirname(path).replace(/^\.$/, "");
  };
  const visit = (folder: string, app: string, depth: number) => {
    const auto = (folder === app ? subfolders(root, within(app, "layers")) : [])
      .map((name) => within(app, `layers/${name}`))
      .filter((layer) => configOf(root, layer) !== undefined);
    const config = configOf(root, folder);
    const large = config !== undefined && statSync(join(root, config)).size > CONFIG_BYTES;
    const names =
      config === undefined || large
        ? config === undefined
          ? []
          : undefined
        : extendsOf(config, readFileSync(join(root, config), "utf8"));
    if (config !== undefined && names === undefined) unread.push(config);
    const extended = (names ?? []).flatMap((name) => {
      const path = layerFolder(root, app, folder, name, members);
      return path === undefined ? [] : (folderOf(path) ?? []);
    });
    for (const layer of [...auto, ...extended]) {
      if (folders.has(layer) || layer === app || depth >= DEPTH) continue;
      folders.add(layer);
      visit(layer, app, depth + 1);
    }
  };
  for (const app of apps) visit(app, app, 0);
  return { folders: [...folders], unread };
}
