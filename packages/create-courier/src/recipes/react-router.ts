import { codeStyleOf, quoted } from "../edit/code-style";
import { appendItem } from "../edit/insert";
import { defaultExportLiteral } from "../edit/literal";
import { addNamedImport } from "../edit/named-import";
import { scanSource } from "../edit/source-scan";
import { routeList, routeModule } from "../project/route-list";
import { viteStudioEdit } from "./edits/studio-browser";
import type { Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { proxyStart } from "./shared/proxy-start";
import { reactDemo, reactQuery } from "./shared/react-demo";
import { proxyScripts, registerModule, sortParts, studioAttach } from "./shared/recipe-parts";
import { addsExample, type ServerNeeds } from "./shared/wired";

const DIR = "app/courier";
const ROUTES = "app/routes.ts";

function route(ctx: RecipeContext, needs: ServerNeeds): RecipeFile {
  const path = "app/routes/api.request.ts";
  const start = registerModule(ctx, path, needs, "this route serves");
  const handler = 'import { courierHandler } from "@noverax/courier-remix";\n';
  const head = needs.register
    ? start.replace(/^import[^\n]*\n/, (line) => `${line}${handler}`)
    : `${handler}${needs.studio ? `\n${start}` : ""}`;
  const content = `${head}
/* Courier's proxy route: the browser calls your API through it. */
const handler = courierHandler();

export const loader = handler;
export const action = handler;
`;
  return { path, content, purpose: "the route the browser calls your API through" };
}

/*
 * The routes list with Courier's two in it, written in the file's style:
 * the page, and the module that serves the proxy — each unless the file
 * lists its module already, however it writes the path. Where a route of
 * the project's has its URL path, the change is left to the person: two
 * routes of one path would clash.
 */
function withRoutes(text: string, example: boolean, proxy: string | undefined): string | undefined {
  const list = routeList(text);
  if (list === undefined) return undefined;
  if (list.fromFolder) return text;
  const wanted = [
    ...(example ? [["courier", "routes/courier.tsx"] as const] : []),
    ...(proxy !== undefined ? [["api/request", proxy] as const] : []),
  ].filter(([, module]) => !list.modules.has(routeModule(module)));
  /* A route of the project's has the URL path already: which of the two serves it is the person's to say. */
  if (wanted.some(([path]) => list.paths.has(path))) return undefined;
  const style = codeStyleOf(text);
  const entries = wanted.map(
    ([path, module]) => `route(${quoted(style, path)}, ${quoted(style, module)})`,
  );
  if (entries.length === 0) return text;
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

function routesEdit(example: boolean, proxy: string | undefined): RecipeEdit {
  return {
    path: ROUTES,
    purpose: "serves Courier's routes: React Router serves only the routes this file lists",
    change: (text) => withRoutes(text, example, proxy),
    manual: {
      file: ROUTES,
      what: "List Courier's routes, which React Router serves only once they are listed",
      lines: [
        ...(example ? ['route("courier", "routes/courier.tsx"),'] : []),
        ...(proxy !== undefined ? [`route("api/request", "${proxy}"),`] : []),
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
  const example = addsExample(ctx);
  const { parts, mount } = proxyStart(
    ctx,
    (needs) => route(ctx, needs),
    {
      module: "@noverax/courier-remix",
      exported: "courierHandler",
      ...(ctx.project.exists(ROUTES)
        ? { connect: (path: string) => routesEdit(example, path.replace(/^app\//, "")) }
        : {}),
    },
    studioAttach("import.meta.env.DEV", ""),
  );
  const { files, edits, manual } = sortParts(parts);
  /* The routes file gets one edit: the one that lists a file of the project's that serves, or Courier's own. */
  const listed = edits.length === 0 && ctx.project.exists(ROUTES) && (example || mount);
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
      ...files,
      ...(example ? [reactQuery(ctx, DIR, "proxy"), reactDemo(ctx, page)] : []),
    ],
    edits: [
      ...edits,
      ...(listed ? [routesEdit(example, mount ? "routes/api.request.ts" : undefined)] : []),
      ...(ctx.choices.studio ? [viteStudioEdit(ctx.project, "remix")] : []),
    ],
    ...courierPackages(ctx, { adapter: "@noverax/courier-remix", react: true, proxy: true }),
    scripts: proxyScripts(ctx),
    manual,
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
