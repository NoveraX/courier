import { nuxtStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, portableServerReach, routesStep, studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { proxyScripts } from "./shared/recipe-parts";
import { vueDemo } from "./shared/vue-demo";

/*
 * Nuxt 4 keeps the app in `app/` and code both sides use in `shared/`, which
 * the app imports as `#shared`: a production build cannot resolve a relative
 * import from `app/` into `shared/` (Nuxt 4.6). Nuxt 3 keeps the app at the root.
 */
function layoutOf(ctx: RecipeContext): { app: string; dir: string; caller: string } {
  return ctx.project.exists("app/app.vue") || ctx.project.exists("app/pages")
    ? { app: "app/", dir: "shared/courier", caller: "#shared/courier/caller" }
    : { app: "", dir: "lib/courier", caller: "lib/courier/caller.ts" };
}

function serverPlugin(ctx: RecipeContext): RecipeFile {
  const path = "server/plugins/courier.ts";
  const studio = ctx.choices.studio
    ? `
  if (import.meta.dev) {
    const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
    await attachRuntime();
  }`
    : "";
  const content = `import { registerSources } from "@noverax/courier";

import config from "${importSpecifier(path, "courier.config.ts", ctx.extension)}";

/**
 * Registers the APIs courier.config.ts lists as the server starts, which
 * the /api/request route serves${ctx.choices.studio ? "; while you develop, connects the server to\n * Courier Studio" : ""}.
 */
export default defineNitroPlugin(async () => {
  registerSources(config.sources);${studio}
});
`;
  return { path, content, purpose: "registers your APIs as the server starts" };
}

const ROUTE = `import { courierHandler } from "@noverax/courier-nuxt";

/** Courier's proxy route: the browser calls your API through it. */
export default courierHandler();
`;

/* Pages render where app.vue has <NuxtPage />: Nuxt's welcome template has its welcome there instead, which moves to the index page. */
function pages(ctx: RecipeContext, app: string): { files: RecipeFile[]; edits: RecipeEdit[] } {
  const appVue = `${app}app.vue`;
  const text = ctx.project.read(appVue);
  if (ctx.project.exists(`${app}pages`) || text === undefined || text.includes("<NuxtPage")) {
    return { files: [], edits: [] };
  }
  const welcome = text.includes("<NuxtWelcome")
    ? [
        {
          path: `${app}pages/index.vue`,
          content: "<template>\n  <NuxtWelcome />\n</template>\n",
          purpose: "your home page, as app.vue showed it",
        },
      ]
    : [];
  const edit: RecipeEdit = {
    path: appVue,
    purpose: "renders the app's pages, the index page holding the welcome",
    change: (current) => {
      if (current.includes("<NuxtPage")) return current;
      const found = current.match(/<NuxtWelcome\s*\/>/g);
      return found?.length === 1
        ? current.replace(/<NuxtWelcome\s*\/>/, "<NuxtPage />")
        : undefined;
    },
    manual: {
      file: appVue,
      what: "Render the app's pages, /courier among them",
      lines: ["<NuxtPage />"],
    },
  };
  return { files: welcome, edits: [edit] };
}

/**
 * Courier in a Nuxt app: its API, registered from a Nitro plugin as the
 * server starts, the route the browser calls it through, a page that
 * shows it at work, and Studio connected from the plugin and Nuxt's config.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * nuxtRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function nuxtRecipe(ctx: RecipeContext): Recipe {
  const { app, dir, caller } = layoutOf(ctx);
  const example = ctx.choices.openapi === undefined;
  const routing = example ? pages(ctx, app) : { files: [], edits: [] };
  return {
    files: [
      ...(example ? exampleApi(ctx, dir, portableServerReach(ctx)) : []),
      courierConfig(ctx, `${dir}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${dir}/api.ts`)] : []),
      serverPlugin(ctx),
      {
        path: "server/api/request.ts",
        content: ROUTE,
        purpose: "the route the browser calls your API through",
      },
      ...(example ? [proxyCaller(ctx, dir), vueDemo(ctx, `${app}pages/courier.vue`, caller)] : []),
      ...routing.files,
    ],
    edits: [...routing.edits, ...(ctx.choices.studio ? [nuxtStudioEdit(ctx.project)] : [])],
    ...courierPackages(ctx, { adapter: "@noverax/courier-nuxt", proxy: true }),
    scripts: proxyScripts(ctx),
    manual: [],
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
