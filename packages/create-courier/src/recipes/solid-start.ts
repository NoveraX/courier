import { viteRoutesEdit } from "./edits/routes-plugin";
import { viteStudioEdit } from "./edits/studio-browser";
import type { ManualStep, Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { proxyStart } from "./shared/proxy-start";
import { proxyScripts, registerModule, sortParts, studioAttach } from "./shared/recipe-parts";
import { routesPluginParts } from "./shared/routes-register";
import { solidDemo } from "./shared/solid-demo";
import { addsExample, type ServerNeeds } from "./shared/wired";

const DIR = "src/courier";

function route(ctx: RecipeContext, needs: ServerNeeds): RecipeFile {
  const path = "src/routes/api/request.ts";
  const start = registerModule(ctx, path, needs, "this route serves");
  const handler = 'import { courierHandler } from "@noverax/courier-solid";\n';
  const head = needs.register
    ? start.replace(/^import[^\n]*\n/, (line) => `${line}${handler}`)
    : `${handler}${needs.studio ? `\n${start}` : ""}`;
  const content = `${head}
/* Courier's proxy route: the browser calls your API through it. */
const handler = courierHandler();

export const GET = handler;
export const POST = handler;
`;
  return { path, content, purpose: "the route the browser calls your API through" };
}

/*
 * A plugin for Vite's config: SolidStart 1 keeps Vite's plugins in
 * app.config.ts, under `vite`, which the command does not change, so the
 * step names it there — unless the config lists it already.
 */
function vitePlugin(
  ctx: RecipeContext,
  edit: RecipeEdit,
  config: string | undefined,
  what: string,
): RecipeEdit | ManualStep | undefined {
  if (config === undefined) return edit;
  const text = ctx.project.read(config) ?? "";
  return edit.change(text) === text ? undefined : { ...edit.manual, file: config, what };
}

/**
 * Courier in a SolidStart app: its API, registered by the route the
 * browser calls it through, a page that shows it at work, Courier's plugin
 * in Vite's config, which builds the page's routes in, and Studio
 * connected from the route and the config.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * solidStartRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function solidStartRecipe(ctx: RecipeContext): Recipe {
  const example = addsExample(ctx);
  const config = ctx.project.exists("app.config.ts") ? "app.config.ts" : undefined;
  const studioEdit = viteStudioEdit(ctx.project, "solid");
  const { parts } = proxyStart(
    ctx,
    (needs) => route(ctx, needs),
    { module: "@noverax/courier-solid", exported: "courierHandler" },
    studioAttach("import.meta.env.DEV", ""),
  );
  const routes = vitePlugin(
    ctx,
    viteRoutesEdit(ctx.project, "@noverax/courier-solid/plugin"),
    config,
    "Build the pages' routes in: add the plugin to the config's vite.plugins",
  );
  const studio = ctx.choices.studio
    ? vitePlugin(
        ctx,
        studioEdit,
        config,
        "Connect the browser to Studio: add the plugin to the config's vite.plugins",
      )
    : undefined;
  const { files, edits, manual } = sortParts([
    ...parts,
    ...(routes ? routesPluginParts(ctx, routes) : []),
    ...(studio ? [studio] : []),
  ]);
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, true)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      ...files,
      ...(example
        ? [proxyCaller(ctx, DIR), solidDemo(ctx, "src/routes/courier.tsx", `${DIR}/caller.ts`)]
        : []),
    ],
    edits,
    ...courierPackages(ctx, { adapter: "@noverax/courier-solid", proxy: true }),
    scripts: proxyScripts(ctx),
    manual,
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
