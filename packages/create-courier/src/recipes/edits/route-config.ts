import { codeMatches } from "../../edit/source-scan";
import { loadsFile } from "../../project/module-target";
import { projectCode } from "../../project/project-code";
import type { ManualStep, RecipeContext } from "../recipe-types";
import { configPathOf } from "../shared/courier-config";

/* The lines of the handler that reads the config inside the code its loader and action alone use. */
const SERVING_HANDLER = [
  "function servingHandler() {",
  "  registerSources(config.sources);",
  "  return courierHandler();",
  "}",
  "",
  "const handler = servingHandler();",
];

/**
 * Where a React Router or Remix route that serves the proxy reads the
 * config as a value at its top level — as Courier's setup wrote the route
 * before this release — the step that keeps the config to the code its
 * loader and action alone use. React Router leaves that code out of a
 * page's bundle, and only that: a config the route's top level reads ships
 * with the page, and Courier's plugin fails such a build.
 *
 * @param ctx - The project, and what is set up in it
 * @returns A step for each such route
 * @example
 * ```ts
 * routeConfigSteps(ctx)[0]?.file; // "app/routes/api.request.ts"
 * ```
 */
export function routeConfigSteps(ctx: RecipeContext): ManualStep[] {
  const config = configPathOf(ctx);
  return projectCode(ctx.project).flatMap((file) => {
    if (!file.imports.some((each) => each.specifier === "@noverax/courier-remix")) return [];
    const configImport = file.imports.find(
      (each) => each.static && loadsFile(ctx.project, file.path, each.specifier, config),
    );
    const local = configImport?.bindings.find((binding) => binding.imported === "default")?.local;
    if (configImport === undefined || local === undefined) return [];
    const { text } = file.scan;
    const topLevel = codeMatches(file.scan, new RegExp(`\\b${local}\\b`, "g")).some((use) => {
      if (configImport.start <= use.index && use.index < configImport.end) return false;
      const lineStart = text.lastIndexOf("\n", use.index - 1) + 1;
      return !/^[ \t]/.test(text.slice(lineStart, use.index + 1));
    });
    if (!topLevel) return [];
    return [
      {
        file: file.path,
        what: "Read the config in the code the route's loader and action alone use: React Router leaves that code out of a page's bundle, and Courier's plugin fails a build whose page takes the config",
        lines: SERVING_HANDLER,
      },
    ];
  });
}
