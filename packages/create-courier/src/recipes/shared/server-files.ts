import type { RecipeContext, RecipeFile } from "../recipe-types";
import { courierConfig, courierMocks, PLAIN_SOURCE, passOnConfig } from "./courier-config";
import { exampleApi } from "./example-api";
import { htmlDemo } from "./html-demo";
import { portableServerReach } from "./next-steps";
import { addsExample } from "./wired";

/** Where a server keeps Courier's modules, unless it keeps its code at the root. */
export const SERVER_DIR = "src/courier";

/**
 * Where a server keeps Courier's modules: beside its code in `src/`, or at
 * the root of a project that has no `src/`.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The folder
 * @example
 * ```ts
 * serverDir(ctx); // "src/courier"
 * ```
 */
export function serverDir(ctx: RecipeContext): string {
  return ctx.project.exists("src") ? SERVER_DIR : "courier";
}

/**
 * Every file a server's setup adds beside its routes: the example API —
 * or none with a specification to import — the list of APIs beside the
 * server's code, which the server registers from, and `courier.config.ts`,
 * which passes it on to Studio and agents; the mock, and the demo page's
 * parts. A project whose config declares APIs already keeps its config.
 *
 * @param ctx - The project, and what is set up in it
 * @param dir - The folder Courier's own modules go in
 * @returns The files
 * @example
 * ```ts
 * serverFiles(ctx, "src/courier").map((file) => file.path);
 * ```
 */
export function serverFiles(ctx: RecipeContext, dir: string): RecipeFile[] {
  const example = addsExample(ctx);
  const api = `${dir}/api.ts`;
  const list = `${dir}/config.ts`;
  /* A project set up already keeps the config it has, wherever it holds the list. */
  if (ctx.configured !== undefined) {
    return [courierConfig(ctx, api, PLAIN_SOURCE, list), passOnConfig(ctx, list)].filter((file) =>
      ctx.project.exists(file.path),
    );
  }
  return [
    ...(example ? exampleApi(ctx, dir, portableServerReach(ctx)) : []),
    courierConfig(ctx, api, PLAIN_SOURCE, list),
    passOnConfig(ctx, list),
    ...(example && ctx.choices.mocks ? [courierMocks(ctx, api)] : []),
    ...(example ? htmlDemo(ctx, dir) : []),
  ];
}

/**
 * The code that connects a server to Studio while you develop, started
 * without waiting for it, so it runs in a CommonJS module as in an ES one.
 *
 * @returns The lines, as one string
 * @example
 * ```ts
 * studioAttachLater();
 * ```
 */
export function studioAttachLater(): string {
  return `/* While you develop, the server's calls show in Courier Studio. */
if (process.env.NODE_ENV !== "production") {
  import("@noverax/courier-studio-core/runtime")
    .then(({ attachRuntime }) => attachRuntime())
    .catch((error: unknown) => console.warn("[courier] Could not connect to Studio:", error));
}`;
}

/**
 * The import a server's Courier file opens with where it registers the
 * config's APIs.
 *
 * @param needs - What the server's start lacks
 * @returns The line, or nothing where the APIs are registered elsewhere
 * @example
 * ```ts
 * serverHead({ register: true, studio: true }); // 'import { registerSources } from "@noverax/courier";\n'
 * ```
 */
export function serverHead(needs: { readonly register: boolean }): string {
  return needs.register ? 'import { registerSources } from "@noverax/courier";\n' : "";
}

/**
 * What a server's Courier file does once its imports are in: the example
 * page's imports, the config's APIs registered and the server connected
 * to Studio — each where it is still missing.
 *
 * @param needs - What the server's start lacks
 * @param pageImports - The example page's imports, or nothing
 * @param list - How the file imports the config's list
 * @returns The code, from the blank line under the framework's imports
 * @example
 * ```ts
 * serverStart({ register: true, studio: false }, "", "./config");
 * ```
 */
export function serverStart(
  needs: { readonly register: boolean; readonly studio: boolean },
  pageImports: string,
  list: string,
): string {
  const local = `${pageImports}${needs.register ? `import config from "${list}";\n` : ""}`;
  return `${local === "" ? "" : `\n${local}`}${needs.register ? "\nregisterSources(config.sources);\n" : ""}${needs.studio ? `\n${studioAttachLater()}\n` : ""}`;
}
