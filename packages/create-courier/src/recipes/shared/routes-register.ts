import { codeMatches } from "../../edit/source-scan";
import { projectCode } from "../../project/project-code";
import { studioRoutesOffEdit } from "../edits/studio-routes-off";
import { importSpecifier } from "../import-specifier";
import type { ManualStep, RecipeContext, RecipeEdit } from "../recipe-types";
import { configPathOf } from "./courier-config";
import type { RecipePart } from "./recipe-parts";
import { wantsRoutes } from "./wants-routes";
import { addsExample } from "./wired";

const REGISTERED = /declare\s+module\s+["']@noverax\/courier\/routes["']/g;
/* Where a registration of its own is likeliest, as Courier's guides name the file: the project's code leaves declaration files out. */
const ENV_FILES = ["courier-env.d.ts", "src/courier-env.d.ts", "app/courier-env.d.ts"];

/** The two parts of a registration: the config's type imported, and the module's `Register` given it. */
export interface RegisterParts {
  readonly importLine: string;
  readonly declaration: string;
}

/**
 * The parts of the lines that type `routes` from the config, for a module
 * that has imports of its own: the import goes among them.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - The module, relative to the root
 * @param name - The name the config's type is imported under: `config`, unless the module binds it
 * @returns The import, and the declaration
 * @example
 * ```ts
 * registerParts(ctx, "src/lib/courier/caller.ts", "config").importLine; // 'import type config from "../../../courier.config";'
 * ```
 */
export function registerParts(ctx: RecipeContext, path: string, name: string): RegisterParts {
  return {
    importLine: `import type ${name} from "${importSpecifier(path, configPathOf(ctx), ctx.extension)}";`,
    declaration: `/* Types \`routes\` from the config: one registration for the app. */
declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof ${name};
  }
}`,
  };
}

/**
 * The lines that type `routes` from the config, for the module that creates
 * the pages' proxy clients: every tsconfig that compiles the module sees
 * them, and the config is imported for its type alone, so none of it
 * reaches a page's bundle.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - The module, relative to the root
 * @returns The lines, as one string
 * @example
 * ```ts
 * routesRegister(ctx, "src/lib/courier/caller.ts"); // 'import type config from "../../../courier.config";\n…'
 * ```
 */
export function routesRegister(ctx: RecipeContext, path: string): string {
  const { importLine, declaration } = registerParts(ctx, path, "config");
  return `${importLine}\n\n${declaration}\n`;
}

/**
 * Whether the project registers its config already: in its code, or in a
 * declaration file of the name Courier's guides give it.
 *
 * @param ctx - The project, and what is set up in it
 * @returns Whether it does
 * @example
 * ```ts
 * registersRoutes(ctx); // true where courier-env.d.ts declares the module's Register
 * ```
 */
export function registersRoutes(ctx: RecipeContext): boolean {
  const { project } = ctx;
  const declared = ENV_FILES.some((path) => {
    const text = project.read(path);
    return text !== undefined && new RegExp(REGISTERED.source).test(text);
  });
  return (
    declared || projectCode(project).some((file) => codeMatches(file.scan, REGISTERED).length > 0)
  );
}

/**
 * Where the setup writes no client of its own, the step that registers
 * the config in the project's — unless the project registers it already.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The step, or none
 * @example
 * ```ts
 * registerStep(ctx)[0]?.file; // "the module that creates your proxy clients"
 * ```
 */
export function registerStep(ctx: RecipeContext): ManualStep[] {
  if (addsExample(ctx) || registersRoutes(ctx)) return [];
  return [
    {
      file: "the module that creates your proxy clients",
      what: `Type routes from ${configPathOf(ctx)}, once for the app: import the config's type from that module's folder`,
      lines: routesRegister(ctx, "courier.ts").trimEnd().split("\n"),
    },
  ];
}

/**
 * Where the pages take their routes from Courier's plugin, what that asks:
 * the plugin in the build's config, and — where the setup writes no client
 * of its own — the config registered in the project's, so `routes` is
 * typed from it; in a project set up already, its config keeps Studio from
 * writing courier.routes.ts, as the config the setup writes does.
 *
 * @param ctx - The project, and what is set up in it
 * @param plugin - The edit that adds the plugin to the build's config, the step that names it, or nothing where the config lists it
 * @returns The parts, or none where the routes come from courier.routes.ts
 * @example
 * ```ts
 * routesPluginParts(ctx, routesPluginOf(ctx.project, "sveltekit"));
 * ```
 */
export function routesPluginParts(
  ctx: RecipeContext,
  plugin: RecipeEdit | ManualStep | undefined,
): RecipePart[] {
  if (ctx.routes !== "plugin" || !wantsRoutes(ctx)) return [];
  return [
    ...(plugin === undefined ? [] : [plugin]),
    ...registerStep(ctx),
    ...(ctx.configured === undefined ? [] : [studioRoutesOffEdit(ctx)]),
  ];
}
