import { createCourierVersion } from "../../create-courier-version";
import type { RecipeContext } from "../recipe-types";
import { wantsRoutes } from "./wants-routes";

/**
 * One of Courier's packages as the command installs it: at the release it
 * shipped with, so the code it writes and the packages it installs match —
 * or as the registry's latest from a build that has no release.
 *
 * @param name - The package
 * @returns The package, with its range when the command has a release
 * @example
 * ```ts
 * courierPackage("@noverax/courier"); // "@noverax/courier@^1.4.0"
 * ```
 */
export function courierPackage(name: string): string {
  const version = createCourierVersion();
  return version === "0.0.0" ? name : `${name}@^${version}`;
}

/** The packages a recipe installs. */
export interface RecipePackages {
  dependencies: string[];
  devDependencies: string[];
}

/** What a framework's setup installs beside Courier's core. */
export interface PackageNeeds {
  /** The framework's Courier package, if it has one. */
  readonly adapter?: string;
  /** Whether a server of the app's connects to Studio, which needs Studio's runtime at run time. */
  readonly runtime?: boolean;
  /**
   * Whether pages call the API through the app's proxy route, so they need
   * their routes: Courier's plugin for the build gives them, or the CLI
   * writes and checks `courier.routes.ts`.
   */
  readonly proxy?: boolean;
  /**
   * Whether the app's server loads the build's config as it starts —
   * `next start` reads next.config — so the plugin is a dependency the app
   * runs with, rather than a dev one.
   */
  readonly configAtStart?: boolean;
}

/**
 * The packages Courier's setup installs for what was asked: the core, the
 * framework's adapter, Zod for a specification's import, Studio and the
 * runtime a server connects to it with, what gives the routes where pages
 * call through the proxy — Courier's plugin for the build, or the CLI that
 * writes the routes module — and the MCP server. What the example's files
 * import — Zod, the React bindings, the mock — the plan reads from the
 * files themselves.
 *
 * @param ctx - The project, and what is set up in it
 * @param needs - What the framework's setup needs
 * @returns The dependencies and the dev dependencies
 * @example
 * ```ts
 * courierPackages(ctx, { adapter: "@noverax/courier-next", proxy: true });
 * ```
 */
export function courierPackages(ctx: RecipeContext, needs: PackageNeeds): RecipePackages {
  const { studio, mcp, openapi } = ctx.choices;
  const { adapter, runtime = true, proxy = false, configAtStart = false } = needs;
  const routes = proxy && wantsRoutes(ctx);
  const plugin = routes && ctx.routes === "plugin";
  const build = courierPackage("@noverax/courier-build");
  return {
    dependencies: [
      courierPackage("@noverax/courier"),
      ...(adapter ? [courierPackage(adapter)] : []),
      ...(plugin && configAtStart ? [build] : []),
      /* The code Studio's import writes types the API with Zod. */
      ...(openapi !== undefined ? ["zod"] : []),
      ...(studio && runtime ? [courierPackage("@noverax/courier-studio-core")] : []),
    ],
    devDependencies: [
      ...(studio ? [courierPackage("@noverax/courier-studio")] : []),
      ...(plugin && !configAtStart ? [build] : []),
      ...(routes && !plugin ? [courierPackage("@noverax/courier-cli")] : []),
      ...(mcp ? [courierPackage("@noverax/courier-mcp")] : []),
    ],
  };
}
