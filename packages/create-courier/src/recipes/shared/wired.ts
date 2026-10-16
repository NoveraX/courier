import { configObjectPath } from "../../agents-policy-edit";
import { fileUsing, registeringFile, studioServerFile } from "../../project/wiring";
import { importSpecifier } from "../import-specifier";
import type { ManualStep, RecipeContext, RecipeFile } from "../recipe-types";

/**
 * Whether the setup adds the example — its API, page, mock and hooks:
 * not with a specification to import in its place, nor in a project whose
 * config declares APIs already.
 *
 * @param ctx - The project, and what is set up in it
 * @returns Whether it does
 * @example
 * ```ts
 * addsExample(ctx); // false where courier.config.ts lists the project's APIs
 * ```
 */
export function addsExample(ctx: RecipeContext): boolean {
  return ctx.choices.openapi === undefined && ctx.configured === undefined;
}

/** What the server's start still lacks, as the project's code reads. */
export interface ServerNeeds {
  /** The config's APIs registered. */
  readonly register: boolean;
  /** The server connected to Studio while you develop, where Studio is set up. */
  readonly studio: boolean;
}

/**
 * What the server's start still lacks: no file of the project's registers
 * the config's APIs, or — where Studio is set up — connects the server to it.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The needs; both in a project without Courier
 * @example
 * ```ts
 * serverNeeds(ctx); // { register: false, studio: true } where only Studio's connection is missing
 * ```
 */
export function serverNeeds(ctx: RecipeContext): ServerNeeds {
  return {
    register: registeringFile(ctx.project) === undefined,
    studio: ctx.choices.studio && studioServerFile(ctx.project) === undefined,
  };
}

/**
 * What a file that starts Courier on the server does, in a sentence: the
 * parts it still lacks.
 *
 * @param needs - What is missing
 * @param register - How registering is said
 * @returns The sentence
 * @example
 * ```ts
 * needsWhat({ register: false, studio: true }); // "Connect the server to Studio while you develop"
 * ```
 */
export function needsWhat(
  needs: ServerNeeds,
  register = "Register Courier's APIs as the server starts",
): string {
  if (!needs.register) return "Connect the server to Studio while you develop";
  return needs.studio ? `${register}, and connect it to Studio while you develop` : register;
}

/**
 * The file that starts Courier on the server — hooks, middleware, a
 * plugin — written for what is still missing: none where nothing is, the
 * project's own file kept where it does it all, and where the project has
 * a file of that name that lacks a part, the lines of that part, for the
 * person to add.
 *
 * @param ctx - The project, and what is set up in it
 * @param file - The file as the setup writes it, for the needs given
 * @param what - What its lines do, for the needs given
 * @param others - Other names the project may have it under
 * @returns The file, the step, or nothing
 * @example
 * ```ts
 * startFile(ctx, (needs) => hooks(ctx, needs), needsWhat, ["src/hooks.server.js"]);
 * ```
 */
export function startFile(
  ctx: RecipeContext,
  file: (needs: ServerNeeds) => RecipeFile,
  what: (needs: ServerNeeds) => string,
  others: readonly string[] = [],
): RecipeFile | ManualStep | undefined {
  const needs = serverNeeds(ctx);
  const written = file(needs);
  const taken = [written.path, ...others].find((path) => ctx.project.exists(path));
  if (!needs.register && !needs.studio) {
    return taken === undefined ? undefined : { ...written, path: taken, recognized: true };
  }
  if (taken === undefined) return written;
  return { file: taken, what: what(needs), lines: written.content.trimEnd().split("\n") };
}

/**
 * A file the framework's Courier package serves from — the proxy route —
 * where no file of the project's serves it yet: kept as the project's own
 * where the file at its path does, and left out where another file does.
 *
 * @param ctx - The project, and what is set up in it
 * @param file - The file
 * @param module - The framework's Courier package
 * @param exported - What of it serves: `apiRoute`, `courierHandler`
 * @param call - Whether it is called; Fastify's plugin is passed
 * @returns The file, or nothing where another file serves
 * @example
 * ```ts
 * servingFile(ctx, route, "@noverax/courier-next", "apiRoute");
 * ```
 */
export function servingFile(
  ctx: RecipeContext,
  file: RecipeFile,
  module: string,
  exported: string,
  call = true,
): RecipeFile | undefined {
  const served = fileUsing(ctx.project, module, exported, call);
  if (served === undefined) return { ...file, recognized: false };
  return served === file.path ? { ...file, recognized: true } : undefined;
}

/**
 * The module a server's Courier file imports the config's list from: the
 * list module the setup adds beside it, or — in a project set up already —
 * the file that holds its config's object.
 *
 * @param ctx - The project, and what is set up in it
 * @param list - The list module the setup adds, relative to the root
 * @returns The module, relative to the root
 * @example
 * ```ts
 * listModule(ctx, "src/courier/config.ts"); // "courier.config.ts" where the config holds the list itself
 * ```
 */
export function listModule(ctx: RecipeContext, list: string): string {
  return ctx.configured === undefined ? list : configObjectPath(ctx.project);
}

/**
 * Where a file of the project's serves the proxy already but the server's
 * start lacks a part, the lines of that part, for the person to add there.
 *
 * @param ctx - The project, and what is set up in it
 * @param served - The file that serves the proxy
 * @param attach - The framework's code that connects the server to Studio
 * @returns The step, or none where nothing is missing
 * @example
 * ```ts
 * missingPartsStep(ctx, "src/index.ts", studioAttachLater());
 * ```
 */
export function missingPartsStep(ctx: RecipeContext, served: string, attach: string): ManualStep[] {
  const needs = serverNeeds(ctx);
  if (!needs.register && !needs.studio) return [];
  const config = importSpecifier(served, configObjectPath(ctx.project), ctx.extension);
  const register = [
    'import { registerSources } from "@noverax/courier";',
    `import config from "${config}";`,
    "",
    "registerSources(config.sources);",
  ];
  const studio = needs.studio ? [...(needs.register ? [""] : []), ...attach.split("\n")] : [];
  return [
    {
      file: served,
      what: needsWhat(needs),
      lines: [...(needs.register ? register : []), ...studio],
    },
  ];
}

/**
 * The file that both starts Courier on the server and serves the proxy —
 * a route that registers the APIs, a server's router, plugin or module —
 * written for what is missing where no file of the project's serves the
 * proxy yet; where one does, it is kept, and only the parts the server's
 * start lacks are left to the person, in that file.
 *
 * @param ctx - The project, and what is set up in it
 * @param file - The file as the setup writes it, for the needs given
 * @param serves - The framework's Courier package, and what of it serves
 * @param attach - The framework's code that connects the server to Studio
 * @returns The parts, and whether a file of the project's serves the proxy already
 * @example
 * ```ts
 * proxyStart(ctx, (needs) => routes(ctx, needs), { module: "@noverax/courier-express", exported: "courierHandler" }, studioAttachLater());
 * ```
 */
export function proxyStart(
  ctx: RecipeContext,
  file: (needs: ServerNeeds) => RecipeFile,
  serves: { readonly module: string; readonly exported: string; readonly call?: boolean },
  attach: string,
): { parts: Array<RecipeFile | ManualStep>; served: boolean } {
  const needs = serverNeeds(ctx);
  const written = file(needs);
  const served = fileUsing(ctx.project, serves.module, serves.exported, serves.call ?? true);
  if (served === undefined) return { parts: [{ ...written, recognized: false }], served: false };
  const own = served === written.path ? [{ ...written, recognized: true }] : [];
  return { parts: [...own, ...missingPartsStep(ctx, served, attach)], served: true };
}
