import { viteStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { studioAttach, studioScripts } from "./shared/recipe-parts";
import { solidDemo } from "./shared/solid-demo";

const DIR = "src/courier";

function route(ctx: RecipeContext): RecipeFile {
  const path = "src/routes/api/request.ts";
  const studio = ctx.choices.studio ? `\n\n${studioAttach("import.meta.env.DEV", "")}` : "";
  const content = `import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-solid";

import config from "${importSpecifier(path, "courier.config.ts", ctx.extension)}";

/* The APIs courier.config.ts lists, which this route serves${ctx.choices.studio ? ";\n   while you develop, the server's calls show in Courier Studio" : ""}. */
registerSources(config.sources);${studio}

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
  const example = ctx.choices.openapi === undefined;
  const config = ctx.project.exists("app.config.ts") ? "app.config.ts" : undefined;
  const studioEdit = viteStudioEdit(ctx.project, "solid");
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, true)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      route(ctx),
      ...(example
        ? [proxyCaller(ctx, DIR), solidDemo(ctx, "src/routes/courier.tsx", `${DIR}/caller.ts`)]
        : []),
    ],
    /* SolidStart 1 keeps Vite's plugins in app.config.ts, under `vite`; the step names it there. */
    edits: ctx.choices.studio && config === undefined ? [studioEdit] : [],
    ...courierPackages(ctx, { adapter: "@noverax/courier-solid" }),
    scripts: studioScripts(ctx),
    manual:
      ctx.choices.studio && config !== undefined
        ? [
            {
              ...studioEdit.manual,
              file: config,
              what: "Connect the browser to Studio: add the plugin to the config's vite.plugins",
            },
          ]
        : [],
    next: [...studioStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
