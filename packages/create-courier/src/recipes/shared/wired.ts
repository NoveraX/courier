import { configObjectPath } from "../../project/config-file";
import { fileUsing, registeringFile, studioServerFile } from "../../project/wiring";
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
 * @param loading - A file of the project's to count as loaded: one the plan has the person load
 * @returns The needs; both in a project without Courier
 * @example
 * ```ts
 * serverNeeds(ctx); // { register: false, studio: true } where only Studio's connection is missing
 * ```
 */
export function serverNeeds(ctx: RecipeContext, loading?: string): ServerNeeds {
  return {
    register: registeringFile(ctx.project, loading) === undefined,
    studio: ctx.choices.studio && studioServerFile(ctx.project, loading) === undefined,
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

/** How a file that starts Courier on the server is written, and what is said of it. */
export interface StartFile {
  /** The file as the setup writes it, for the needs given. */
  readonly file: (needs: ServerNeeds) => RecipeFile;
  /** What its lines do, for the needs given. */
  readonly what: (needs: ServerNeeds) => string;
  /** Other names the project may have it under. */
  readonly others?: readonly string[];
  /**
   * The step for a file of the project's of that name that has the
   * function the lines go in — Next.js's `register()` — rather than the
   * file whole.
   */
  readonly inside?: (
    needs: ServerNeeds,
    text: string,
  ) => Pick<ManualStep, "what" | "lines"> | undefined;
}

/**
 * The file that starts Courier on the server — hooks, middleware, a
 * plugin — written for what is still missing. Where nothing is, the file
 * of the project's that does it is kept and named; where the project has a
 * file of that name that lacks a part, the lines of that part are left to
 * the person — inside the function they go in, where it has one.
 *
 * @param ctx - The project, and what is set up in it
 * @param start - How the file is written
 * @returns The file, the step, or nothing
 * @example
 * ```ts
 * startFile(ctx, { file: (needs) => hooks(ctx, needs), what: needsWhat, others: ["src/hooks.server.js"] });
 * ```
 */
export function startFile(
  ctx: RecipeContext,
  start: StartFile,
): RecipeFile | ManualStep | undefined {
  const needs = serverNeeds(ctx);
  const written = start.file(needs);
  const taken = [written.path, ...(start.others ?? [])].find((path) => ctx.project.exists(path));
  if (!needs.register && !needs.studio) {
    const doing = taken ?? registeringFile(ctx.project) ?? studioServerFile(ctx.project);
    return doing === undefined ? undefined : { ...written, path: doing, recognized: true };
  }
  if (taken === undefined) return written;
  const inside = start.inside?.(needs, ctx.project.read(taken) ?? "");
  if (inside !== undefined) return { file: taken, ...inside };
  return { file: taken, what: start.what(needs), lines: written.content.trimEnd().split("\n") };
}

/**
 * A file the framework's Courier package serves from — the proxy route —
 * where no file of the project's that the framework loads serves it yet:
 * kept as the project's own where the file at its path does, and in its
 * place, named, where another file does.
 *
 * @param ctx - The project, and what is set up in it
 * @param file - The file
 * @param module - The framework's Courier package
 * @param exported - What of it serves: `apiRoute`, `courierHandler`
 * @param call - Whether it is called; Fastify's plugin is passed
 * @returns The file, or the project's that serves
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
): RecipeFile {
  const served = fileUsing(ctx.project, module, exported, call);
  if (served === undefined || !served.loaded) return { ...file, recognized: false };
  return { ...file, path: served.path, recognized: true };
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
