import { posix } from "node:path";

import { type AstNode, isNode, nameOf } from "../codemod/ast";
import { stringOf } from "../codemod/literals";
import { bare } from "./config-objects";
import { metaMember } from "./meta-calls";

/** A path a config names, as data: from the package's root — where it starts at the config's own folder, as `__dirname` does, or is resolved from where the tool runs — or relative, as written. */
export interface ConfigPath {
  readonly path: string;
  readonly fromPackage: boolean;
}

/** How a config's module names Node's functions of paths: the local names of `resolve`, `join` and `fileURLToPath`, and of the modules that give them, taken whole. */
export interface PathNames {
  readonly resolve: ReadonlySet<string>;
  readonly join: ReadonlySet<string>;
  readonly fileURLToPath: ReadonlySet<string>;
  readonly path: ReadonlySet<string>;
  readonly url: ReadonlySet<string>;
}

type PathFunction = "resolve" | "join" | "fileURLToPath";

const PATH_MODULES = new Set(["path", "node:path"]);
/* How deep calls of paths are read inside each other: one past this is not data. */
const MAX_DEPTH = 16;
const URL_MODULES = new Set(["url", "node:url"]);

/* The module a `require()` of a string names, as a declarator's value. */
function requiredOf(node: unknown): string | undefined {
  const value = bare(node);
  if (!isNode(value) || value.type !== "CallExpression" || nameOf(value.callee) !== "require")
    return undefined;
  const [first] = Array.isArray(value.arguments) ? value.arguments : [];
  return stringOf(first);
}

/* The names a declaration or an import binds of a module: each one's own name, or none for the module whole. */
function boundOf(
  statement: AstNode,
): Array<[string | undefined, string | undefined, string | undefined]> {
  if (statement.type === "ImportDeclaration") {
    const source = isNode(statement.source) ? statement.source.value : undefined;
    const specifiers = Array.isArray(statement.specifiers)
      ? statement.specifiers.filter(isNode)
      : [];
    return specifiers.map((each) => [
      typeof source === "string" ? source : undefined,
      each.type === "ImportSpecifier"
        ? (nameOf(each.imported) ?? stringOf(each.imported))
        : undefined,
      nameOf(each.local),
    ]);
  }
  if (statement.type !== "VariableDeclaration" || !Array.isArray(statement.declarations)) return [];
  return statement.declarations.filter(isNode).flatMap((declarator) => {
    const module = requiredOf(declarator.init);
    const { id } = declarator;
    if (module === undefined || !isNode(id)) return [];
    if (id.type === "Identifier") return [[module, undefined, nameOf(id)]];
    const properties =
      id.type === "ObjectPattern" && Array.isArray(id.properties) ? id.properties : [];
    return properties
      .filter(isNode)
      .filter((each) => each.type === "Property" && each.computed !== true)
      .map((each): [string, string | undefined, string | undefined] => [
        module,
        nameOf(each.key),
        nameOf(each.value),
      ]);
  });
}

/**
 * How a config's module names Node's functions of paths: the names it
 * imports `resolve` and `join` of `path` or `node:path` under, and
 * `fileURLToPath` of `url` or `node:url`, and the names of those modules
 * taken whole — by an import, or by a `require()` at its top.
 *
 * @param program - The config's tree
 * @returns The names
 * @example
 * ```ts
 * pathNames(program).resolve; // Set { "resolve" } for `import { resolve } from "node:path"`
 * ```
 */
export function pathNames(program: AstNode): PathNames {
  const names = {
    resolve: new Set<string>(),
    join: new Set<string>(),
    fileURLToPath: new Set<string>(),
    path: new Set<string>(),
    url: new Set<string>(),
  };
  for (const statement of Array.isArray(program.body) ? program.body.filter(isNode) : [])
    for (const [module, imported, local] of boundOf(statement)) {
      if (module === undefined || local === undefined) continue;
      const [paths, urls] = [PATH_MODULES.has(module), URL_MODULES.has(module)];
      if (imported === undefined && paths) names.path.add(local);
      else if (imported === undefined && urls) names.url.add(local);
      else if (paths && (imported === "resolve" || imported === "join")) names[imported].add(local);
      else if (urls && imported === "fileURLToPath") names.fileURLToPath.add(local);
    }
  return names;
}

/* The function of paths a call names: by a name the module imports, or through a module it takes whole. */
function calleeOf(node: unknown, names: PathNames): PathFunction | undefined {
  const name = nameOf(node);
  if (name !== undefined)
    return (["resolve", "join", "fileURLToPath"] as const).find((each) => names[each].has(name));
  if (!isNode(node) || node.type !== "MemberExpression" || node.computed === true) return undefined;
  const [space, member] = [nameOf(node.object) ?? "", nameOf(node.property)];
  if (names.path.has(space) && (member === "resolve" || member === "join")) return member;
  return names.url.has(space) && member === "fileURLToPath" ? member : undefined;
}

/* A path joined from parts, `""` for the package's root itself. */
function plain(parts: readonly ConfigPath[], fromPackage: boolean): ConfigPath {
  const path = posix.join(...parts.map((each) => each.path), ".");
  return { path: path === "." ? "" : path.replace(/\/$/, ""), fromPackage };
}

/* The file `new URL(<string>, import.meta.url)` names: the string from the config's own folder. */
function urlPathOf(node: unknown): ConfigPath | undefined {
  const value = bare(node);
  if (!isNode(value) || value.type !== "NewExpression" || nameOf(value.callee) !== "URL")
    return undefined;
  const [written, base, ...more] = Array.isArray(value.arguments) ? value.arguments : [];
  const path = stringOf(bare(written));
  if (more.length > 0 || path === undefined || metaMember(bare(base)) !== "url") return undefined;
  return /^(?:\/|[a-z][a-z\d+.-]*:)/i.test(path)
    ? undefined
    : plain([{ path, fromPackage: true }], true);
}

/**
 * A path a config of code names, read without running it: a string;
 * `__dirname` or `import.meta.dirname`, the config's own folder;
 * `fileURLToPath(new URL(<string>, import.meta.url))`; and `resolve()`
 * or `join()` of Node's `path` — imported by name or whole — of those,
 * resolved as Node does, from where the tool runs in the package where
 * no part starts at a folder. Any other value is not data.
 *
 * @param node - The value
 * @param names - How the config's module names Node's functions of paths
 * @param depth - How deep inside other calls of paths the value is
 * @returns The path, or `undefined` where it is not data the upgrade reads
 * @example
 * ```ts
 * pathOf(call, names); // { path: "pages/admin/index.html", fromPackage: true } for resolve(__dirname, "pages/admin/index.html")
 * ```
 */
export function pathOf(node: unknown, names: PathNames, depth = 0): ConfigPath | undefined {
  const value = bare(node);
  if (depth > MAX_DEPTH) return undefined;
  const written = stringOf(value);
  if (written !== undefined) return { path: written, fromPackage: false };
  if (nameOf(value) === "__dirname" || metaMember(value) === "dirname")
    return { path: "", fromPackage: true };
  if (!isNode(value) || value.type !== "CallExpression") return undefined;
  const callee = calleeOf(value.callee, names);
  const args = Array.isArray(value.arguments) ? value.arguments : [];
  if (callee === "fileURLToPath") return args.length === 1 ? urlPathOf(args[0]) : undefined;
  const parts = args.map((each) => pathOf(each, names, depth + 1));
  if (callee === undefined || parts.length === 0) return undefined;
  if (!parts.every((each): each is ConfigPath => each !== undefined)) return undefined;
  if (callee === "join")
    return parts.slice(1).some((each) => each.fromPackage)
      ? undefined
      : plain(parts, parts[0]?.fromPackage === true);
  /* resolve(): from the last part that starts at a folder; an absolute string is one outside the package. */
  const last = parts.findLastIndex((each) => each.fromPackage || each.path.startsWith("/"));
  if (last !== -1 && parts[last]?.fromPackage !== true) return undefined;
  return plain(parts.slice(Math.max(last, 0)), true);
}
