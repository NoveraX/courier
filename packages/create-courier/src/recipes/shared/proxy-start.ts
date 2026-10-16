import { isRecord } from "../../is-record";
import { configObjectPath } from "../../project/config-file";
import { parseJsonc } from "../../project/jsonc";
import { fileUsing } from "../../project/wiring";
import { importSpecifier } from "../import-specifier";
import type { ManualStep, RecipeContext, RecipeFile } from "../recipe-types";
import type { RecipePart } from "./recipe-parts";
import { needsWhat, type ServerNeeds, serverNeeds } from "./wired";

/* The folder the project's tsconfig compiles from, where it names one: `src`. */
function rootDirOf(ctx: RecipeContext): string | undefined {
  let config: unknown;
  try {
    config = parseJsonc(ctx.project.read("tsconfig.json") ?? "{}");
  } catch {
    return undefined;
  }
  const options =
    isRecord(config) && isRecord(config.compilerOptions) ? config.compilerOptions : {};
  const dir = typeof options.rootDir === "string" ? options.rootDir.replace(/^\.\/|\/$/g, "") : "";
  return dir === "" || dir === "." || dir.startsWith("..") ? undefined : dir;
}

/* The lines that register the config's list from a file, and what to say where that file cannot import the config. */
function registerLines(ctx: RecipeContext, file: string): { lines: string[]; note: string } {
  const object = configObjectPath(ctx.project);
  const dir = rootDirOf(ctx);
  const outside = dir !== undefined && file.startsWith(`${dir}/`) && !object.startsWith(`${dir}/`);
  const list = outside ? `${dir}/courier/config.ts` : object;
  const lines = [
    'import { registerSources } from "@noverax/courier";',
    `import config from "${importSpecifier(file, list, ctx.extension)}";`,
    "",
    "registerSources(config.sources);",
  ];
  const note = outside
    ? `. TypeScript compiles ${dir}/ alone, so ${object} is out of its reach: move the list to ${list}, and let ${object} pass it on with export { default } from "${importSpecifier(object, list, ctx.extension)}"`
    : "";
  return { lines, note };
}

/**
 * Where a file of the project's serves the proxy already but the server's
 * start lacks a part, the lines of that part, for the person to add there.
 *
 * @param ctx - The project, and what is set up in it
 * @param served - The file that serves the proxy
 * @param attach - The framework's code that connects the server to Studio
 * @param needs - What the server's start lacks
 * @returns The step, or none where nothing is missing
 * @example
 * ```ts
 * missingPartsStep(ctx, "src/index.ts", studioAttachLater(), serverNeeds(ctx));
 * ```
 */
export function missingPartsStep(
  ctx: RecipeContext,
  served: string,
  attach: string,
  needs: ServerNeeds,
): ManualStep[] {
  if (!needs.register && !needs.studio) return [];
  const register = needs.register ? registerLines(ctx, served) : { lines: [], note: "" };
  const studio = needs.studio ? [...(needs.register ? [""] : []), ...attach.split("\n")] : [];
  return [
    {
      file: served,
      what: `${needsWhat(needs)}${register.note}`,
      lines: [...register.lines, ...studio],
    },
  ];
}

/** How the file that serves the proxy is found, and how the app loads one. */
export interface ProxyServes {
  /** The framework's Courier package. */
  readonly module: string;
  /** What of it serves: `courierHandler`, `courierPlugin`. */
  readonly exported: string;
  /** Whether it is called; Fastify's plugin is passed. */
  readonly call?: boolean;
  /**
   * The part that has the app load a file of the project's that serves the
   * proxy, where nothing loads it. Left out where the framework loads files
   * by their place: there a file elsewhere does not serve, and the setup's
   * is written.
   */
  readonly connect?: (path: string) => RecipePart;
}

/**
 * The file that both starts Courier on the server and serves the proxy —
 * a route that registers the APIs, a server's router, plugin or module.
 * Where no file of the project's serves the proxy, the setup's is written
 * for what is missing, and the app is to load it. Where one does, it is
 * kept and named, the parts the server's start lacks are left to the
 * person in that file, and — where nothing loads it — so is loading it.
 *
 * @param ctx - The project, and what is set up in it
 * @param file - The file as the setup writes it, for the needs given
 * @param serves - How the file that serves is found, and loaded
 * @param attach - The framework's code that connects the server to Studio
 * @returns The parts, and whether the app is still to load the setup's own file
 * @example
 * ```ts
 * proxyStart(ctx, (needs) => routes(ctx, needs), { module: "@noverax/courier-express", exported: "courierHandler", connect }, studioAttachLater());
 * ```
 */
export function proxyStart(
  ctx: RecipeContext,
  file: (needs: ServerNeeds) => RecipeFile,
  serves: ProxyServes,
  attach: string,
): { parts: RecipePart[]; mount: boolean } {
  const found = fileUsing(ctx.project, serves.module, serves.exported, serves.call ?? true);
  const placed = found === undefined || found.loaded || serves.connect !== undefined;
  const served = placed ? found : undefined;
  const needs = serverNeeds(ctx, served?.path);
  const written = file(needs);
  if (served === undefined) return { parts: [{ ...written, recognized: false }], mount: true };
  const kept: RecipeFile = { ...written, path: served.path, recognized: true };
  const missing = missingPartsStep(ctx, served.path, attach, needs);
  if (served.path === written.path) return { parts: [kept, ...missing], mount: !served.loaded };
  const connect =
    served.loaded || serves.connect === undefined ? [] : [serves.connect(served.path)];
  return { parts: [kept, ...missing, ...connect], mount: false };
}

/**
 * The step that has a server load a file of the project's that serves the
 * proxy, where no file of the app loads it.
 *
 * @param path - The file
 * @param how - How the app loads it: "mount its routes on your Express app"
 * @returns The step
 * @example
 * ```ts
 * loadStep("src/courier.ts", "mount its routes on your Hono app");
 * ```
 */
export function loadStep(path: string, how: string): ManualStep {
  return {
    file: path,
    what: `Courier's proxy is served here, but no file of the app loads this one: ${how}`,
    lines: [],
  };
}
