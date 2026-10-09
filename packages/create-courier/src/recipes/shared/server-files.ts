import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { courierConfig, courierMocks } from "./courier-config";
import { exampleApi } from "./example-api";
import { htmlDemo } from "./html-demo";
import { portableServerReach } from "./next-steps";

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
 * `sources.ts`: the APIs a server registers as it starts. A server that
 * TypeScript compiles from `src/` cannot import courier.config.ts from the
 * project's root, so it keeps its list beside its code, and the config
 * lists the same for Studio and agents.
 *
 * @param ctx - The project, and what is set up in it
 * @param dir - The folder Courier's own modules go in
 * @returns The file
 * @example
 * ```ts
 * sourcesFile(ctx, "src/courier").path; // "src/courier/sources.ts"
 * ```
 */
export function sourcesFile(ctx: RecipeContext, dir: string): RecipeFile {
  const path = `${dir}/sources.ts`;
  const content = `import { api } from "${importSpecifier(path, `${dir}/api.ts`, ctx.extension)}";

/**
 * The APIs this server answers for at /api/request, registered as it
 * starts. courier.config.ts lists them too, for Studio and agents: an API
 * you add there, add here as well.
 */
export const sources = { api };
`;
  return { path, content, purpose: "the APIs the server registers as it starts" };
}

/**
 * Every file a server's setup adds beside its routes: the example API —
 * or none with a specification to import — the config and the mock, the
 * server's list of APIs, and the demo page's parts.
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
  const example = ctx.choices.openapi === undefined;
  const api = `${dir}/api.ts`;
  return [
    ...(example ? exampleApi(ctx, dir, portableServerReach(ctx)) : []),
    courierConfig(ctx, api),
    ...(example && ctx.choices.mocks ? [courierMocks(ctx, api)] : []),
    ...(example ? [sourcesFile(ctx, dir), ...htmlDemo(ctx, dir)] : []),
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
