import { viteStudioEdit } from "./edits/studio-browser";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { proxyStart } from "./shared/proxy-start";
import { proxyScripts, registerModule, sortParts, studioAttach } from "./shared/recipe-parts";
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

/**
 * Courier in a SolidStart app: its API, registered by the route the
 * browser calls it through, a page that shows it at work, and Studio
 * connected from the route and Vite's config.
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
  const { files, manual } = sortParts(parts);
  /* SolidStart 1 keeps Vite's plugins in app.config.ts, under `vite`, which the command does not change. */
  const studioByHand =
    ctx.choices.studio &&
    config !== undefined &&
    studioEdit.change(ctx.project.read(config) ?? "") !== ctx.project.read(config);
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
    /* SolidStart 1 keeps Vite's plugins in app.config.ts, under `vite`; the step names it there. */
    edits: ctx.choices.studio && config === undefined ? [studioEdit] : [],
    ...courierPackages(ctx, { adapter: "@noverax/courier-solid", proxy: true }),
    scripts: proxyScripts(ctx),
    manual: [
      ...manual,
      ...(studioByHand
        ? [
            {
              ...studioEdit.manual,
              file: config ?? "app.config.ts",
              what: "Connect the browser to Studio: add the plugin to the config's vite.plugins",
            },
          ]
        : []),
    ],
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
