import { codeStyleOf, quoted } from "../edit/code-style";
import { appendItem } from "../edit/insert";
import { defaultExportLiteral } from "../edit/literal";
import { addNamedImport } from "../edit/named-import";
import { scanSource } from "../edit/source-scan";
import { viteStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { exampleApi } from "./shared/example-api";
import { devStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { reactDemo, reactQuery } from "./shared/react-demo";
import { studioAttach, studioScripts } from "./shared/recipe-parts";

const DIR = "app/courier";
const ROUTES = "app/routes.ts";

function route(ctx: RecipeContext): RecipeFile {
  const path = "app/routes/api.request.ts";
  const studio = ctx.choices.studio ? `\n\n${studioAttach("import.meta.env.DEV", "")}` : "";
  const content = `import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-remix";

import config from "${importSpecifier(path, "courier.config.ts", ctx.extension)}";

/* The APIs courier.config.ts lists, which this route serves${ctx.choices.studio ? ";\n   while you develop, the server's calls show in Courier Studio" : ""}. */
registerSources(config.sources);${studio}

/* Courier's proxy route: the browser calls your API through it. */
const handler = courierHandler();

export const loader = handler;
export const action = handler;
`;
  return { path, content, purpose: "the route the browser calls your API through" };
}

/* The routes list with Courier's two in it, written in the file's style. */
function withRoutes(text: string, example: boolean): string | undefined {
  if (text.includes("routes/api.request.ts") || /\bflatRoutes\s*\(/.test(text)) return text;
  const style = codeStyleOf(text);
  const entries = [
    ...(example
      ? [`route(${quoted(style, "courier")}, ${quoted(style, "routes/courier.tsx")})`]
      : []),
    `route(${quoted(style, "api/request")}, ${quoted(style, "routes/api.request.ts")})`,
  ];
  let changed = text;
  for (const entry of entries) {
    const scan = scanSource(changed);
    const list = scan === undefined ? undefined : defaultExportLiteral(scan, []);
    if (scan === undefined || list === undefined || changed[list.open] !== "[") return undefined;
    changed = appendItem(scan, list, entry);
  }
  const scan = scanSource(changed);
  return scan === undefined ? undefined : addNamedImport(scan, "@react-router/dev/routes", "route");
}

function routesEdit(example: boolean): RecipeEdit {
  return {
    path: ROUTES,
    purpose: "serves Courier's routes: React Router serves only the routes this file lists",
    change: (text) => withRoutes(text, example),
    manual: {
      file: ROUTES,
      what: "List Courier's routes, which React Router serves only once they are listed",
      lines: [
        ...(example ? ['route("courier", "routes/courier.tsx"),'] : []),
        'route("api/request", "routes/api.request.ts"),',
      ],
    },
  };
}

/**
 * Courier in a React Router app — or a Remix one, whose file routes need
 * no list: its API, registered by the route the browser calls it through,
 * a page that shows it at work, and Studio connected from the route and
 * Vite's config.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * reactRouterRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function reactRouterRecipe(ctx: RecipeContext): Recipe {
  const example = ctx.choices.openapi === undefined;
  const page = {
    path: "app/routes/courier.tsx",
    query: `${DIR}/query.ts`,
    directive: "",
    variable: "VITE_API_URL",
  };
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, true)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      route(ctx),
      ...(example ? [reactQuery(ctx, DIR, "proxy"), reactDemo(ctx, page)] : []),
    ],
    edits: [
      ...(ctx.project.exists(ROUTES) ? [routesEdit(example)] : []),
      ...(ctx.choices.studio ? [viteStudioEdit(ctx.project, "remix")] : []),
    ],
    ...courierPackages(ctx, { adapter: "@noverax/courier-remix", react: true }),
    scripts: studioScripts(ctx),
    manual: [],
    next: [...studioStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
