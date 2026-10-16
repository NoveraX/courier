import { createCourierVersion } from "../../create-courier-version";
import type { RecipeContext } from "../recipe-types";
import { wantsRoutes } from "./wants-routes";
import { addsExample } from "./wired";

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
  /** Whether the app renders with React, and so gets Courier's React Query hooks. */
  readonly react?: boolean;
  /** Whether a server of the app's connects to Studio, which needs Studio's runtime at run time. */
  readonly runtime?: boolean;
  /**
   * Whether pages call the API through the app's proxy route, so the
   * project keeps `courier.routes.ts`, which Courier's CLI writes and checks.
   */
  readonly proxy?: boolean;
}

/**
 * The packages Courier's setup installs: the core and Zod for the API, the
 * framework's adapter, the React bindings for a React app, Studio and the
 * runtime a server connects to it with, the CLI that writes the routes
 * module where pages call through the proxy, the mock and what it runs on,
 * and the MCP server.
 *
 * @param ctx - The project, and what is set up in it
 * @param needs - What the framework's setup needs
 * @returns The dependencies and the dev dependencies
 * @example
 * ```ts
 * courierPackages(ctx, { adapter: "@noverax/courier-next", react: true, proxy: true });
 * ```
 */
export function courierPackages(ctx: RecipeContext, needs: PackageNeeds): RecipePackages {
  const { studio, mocks, mcp, openapi } = ctx.choices;
  const { adapter, react = false, runtime = true, proxy = false } = needs;
  const example = addsExample(ctx);
  /* A project set up already has the API it calls, and its own way of calling it from React. */
  const fresh = ctx.configured === undefined;
  return {
    dependencies: [
      courierPackage("@noverax/courier"),
      ...(adapter ? [courierPackage(adapter)] : []),
      ...(react && fresh
        ? [courierPackage("@noverax/courier-react"), "@tanstack/react-query"]
        : []),
      ...(fresh || openapi !== undefined ? ["zod"] : []),
      ...(studio && runtime ? [courierPackage("@noverax/courier-studio-core")] : []),
    ],
    devDependencies: [
      ...(studio ? [courierPackage("@noverax/courier-studio")] : []),
      ...(proxy && wantsRoutes(ctx) ? [courierPackage("@noverax/courier-cli")] : []),
      ...(mocks && example
        ? [courierPackage("@noverax/courier-mock"), "hono", "@hono/node-server"]
        : []),
      ...(mcp ? [courierPackage("@noverax/courier-mcp")] : []),
    ],
  };
}
