import { codeStyleOf, namedImport } from "../edit/code-style";
import { binds, importsOf, type ModuleImport, usesOf } from "../edit/imports";
import { addImportLine } from "../edit/insert";
import { codeMatches, nextCode, type SourceScan, scanSource } from "../edit/source-scan";
import { loadsFile } from "../project/module-target";
import { projectCode } from "../project/project-code";
import type { RecipeContext, RecipeEdit } from "../recipes/recipe-types";
import { registerParts } from "../recipes/shared/routes-register";
import type { RoutesModule } from "./routes-modules";

const ENTRY = "@noverax/courier/routes";
const REGISTERED = /declare\s+module\s+["']@noverax\/courier\/routes["']/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

interface Change {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/* Whether the name at `at` stands alone in an object, `{ apiRoutes }`, as a shorthand property does. */
function isShorthand(scan: SourceScan, at: number, length: number): boolean {
  let open = -1;
  for (const [start, close] of scan.closer)
    if (start < at && at < close && start > open) open = start;
  let before = at - 1;
  while (before > open && /\s/.test(scan.text[before] ?? "")) before--;
  const after = nextCode(scan, at + length);
  const previous = scan.text[before];
  const next = after === -1 ? undefined : scan.text[after];
  return (
    scan.text[open] === "{" &&
    (previous === "{" || previous === ",") &&
    (next === "}" || next === ",")
  );
}

/* The import gone with its line, and the blank line it leaves between two others. */
function removal(text: string, each: ModuleImport): Change {
  let end = each.end;
  while (text[end] === ";" || text[end] === " " || text[end] === "\t") end++;
  if (text[end] === "\n") end++;
  const lineStart = text.lastIndexOf("\n", each.start - 1) + 1;
  const start = text.slice(lineStart, each.start).trim() === "" ? lineStart : each.start;
  if (text.slice(0, start).endsWith("\n\n") && text[end] === "\n") end++;
  return { start, end, text: "" };
}

/* The name `routes` is read under: the one the file imports it as already, else `routes`, unless the file binds that. */
function routesName(
  scan: SourceScan,
  imports: readonly ModuleImport[],
): { name: string; imported: boolean } {
  const binding = imports
    .filter((each) => each.specifier === ENTRY)
    .flatMap((each) => each.bindings)
    .find((each) => each.imported === "routes");
  if (binding !== undefined) return { name: binding.local, imported: true };
  return { name: binds(scan, "routes") ? "courierRoutes" : "routes", imported: false };
}

/* The file with `routes` imported, where it is not yet, and the config registered, where it is not yet. */
function withEntry(
  ctx: RecipeContext,
  path: string,
  text: string,
  name: string,
  imported: boolean,
) {
  let changed = text;
  if (!imported) {
    const scan = scanSource(changed);
    if (scan === undefined) return undefined;
    const names = [name === "routes" ? "routes" : `routes as ${name}`];
    changed = addImportLine(scan, namedImport(codeStyleOf(text), names, ENTRY));
  }
  const scan = scanSource(changed);
  if (scan === undefined) return undefined;
  if (codeMatches(scan, REGISTERED).length > 0) return changed;
  const parts = registerParts(ctx, path, binds(scan, "config") ? "courierConfig" : "config");
  const withImport = addImportLine(scan, parts.importLine);
  const at = withImport.indexOf(parts.importLine) + parts.importLine.length;
  return `${withImport.slice(0, at)}\n\n${parts.declaration}${withImport.slice(at)}`;
}

/* The file with each name it imports from the module read from `routes` instead, the import gone; `undefined` where it takes the module otherwise. */
function withPluginRoutes(ctx: RecipeContext, path: string, text: string, module: RoutesModule) {
  const scan = scanSource(text);
  if (scan === undefined) return undefined;
  const imports = importsOf(scan);
  const taken = imports.filter((each) => loadsFile(ctx.project, path, each.specifier, module.path));
  if (taken.length === 0) return text;
  const named = (each: ModuleImport) =>
    each.static &&
    each.bindings.length > 0 &&
    each.bindings.every((binding) => module.sources.has(binding.imported));
  if (!taken.every(named)) return undefined;
  const { name, imported } = routesName(scan, imports);
  const changes = taken.flatMap((each) => [
    removal(text, each),
    ...each.bindings.flatMap((binding) => {
      const source = module.sources.get(binding.imported) ?? "";
      const read = IDENTIFIER.test(source)
        ? `${name}.${source}`
        : `${name}[${JSON.stringify(source)}]`;
      return usesOf(scan, imports, binding.local, false).map((at) => ({
        start: at,
        end: at + binding.local.length,
        text: isShorthand(scan, at, binding.local.length) ? `${binding.local}: ${read}` : read,
      }));
    }),
  ]);
  const moved = changes
    .sort((a, b) => b.start - a.start)
    .reduce(
      (current, change) =>
        `${current.slice(0, change.start)}${change.text}${current.slice(change.end)}`,
      text,
    );
  return withEntry(ctx, path, moved, name, imported);
}

/**
 * The edits that move the project's modules from a routes module Courier
 * wrote to the routes Courier's plugin builds in: each name a module
 * imports from it read from `@noverax/courier/routes` instead —
 * `apiRoutes` as `routes.api` — the import gone, and the config registered
 * there, so `routes` is typed from it. A module that takes the routes
 * module otherwise — whole, or passing it on — is left to the person.
 *
 * @param ctx - The project, and what is set up in it
 * @param module - The routes module
 * @returns The edits, one for each module that imports it
 * @example
 * ```ts
 * routesClientEdits(ctx, { path: "courier.routes.ts", sources: new Map([["apiRoutes", "api"]]) });
 * ```
 */
export function routesClientEdits(ctx: RecipeContext, module: RoutesModule): RecipeEdit[] {
  const sources = [...module.sources.values()];
  return projectCode(ctx.project)
    .filter((file) => file.path !== module.path)
    .filter((file) =>
      file.imports.some((each) => loadsFile(ctx.project, file.path, each.specifier, module.path)),
    )
    .map((file) => ({
      path: file.path,
      purpose: `takes the routes from Courier's plugin in place of ${module.path}`,
      change: (text: string) => withPluginRoutes(ctx, file.path, text, module),
      manual: {
        file: file.path,
        what: `Take the routes from Courier's plugin in place of ${module.path}: pass routes.<source> where the module passes its routes, and register the config`,
        lines: [
          `import { routes } from "${ENTRY}";`,
          ...sources.map((source) => `createProxyCaller(routes.${source})`),
        ],
      },
    }));
}
