import type { CourierRoutesOptions } from "../util/courier-routes-options";
import { configInPageRule } from "./config-in-page-rule";
import { routesProject } from "./routes-project";
import { routesRule } from "./routes-rule";

/** What of a webpack or Rspack compiler the plugin reads, and adds its rules to. */
export interface RoutesCompiler {
  /** The folder the compiler resolves from: the project's root. */
  readonly context: string;
  readonly options: { readonly target?: unknown; readonly module: { rules?: unknown[] } };
}

/* What a server runs, not a browser: Node and Electron's main process, as webpack names them. */
const SERVER_TARGET = /^(async-)?node|^electron-(main|preload)|^nwjs/;

/**
 * The webpack and Rspack plugin that builds the routes a page's proxy
 * client may call from `courier.config.ts`, in place of the module
 * `@noverax/courier/routes` ships, for every bundle the compiler builds. No
 * routes file is written, and the routes carry no address, path or
 * middleware. A page's bundle that takes the config itself fails.
 *
 * @example
 * ```ts
 * // webpack.config.js
 * import { CourierRoutesPlugin } from "@noverax/courier-build/webpack";
 *
 * export default { plugins: [new CourierRoutesPlugin()] };
 * ```
 */
export class CourierRoutesPlugin {
  readonly #options: CourierRoutesOptions;

  /**
   * @param options - Where the config is, when it is not found from the compiler's context
   */
  constructor(options: CourierRoutesOptions = {}) {
    this.#options = options;
  }

  /**
   * @param compiler - The compiler the plugin is given
   */
  apply(compiler: RoutesCompiler): void {
    const project = routesProject(compiler.context, this.#options);
    compiler.options.module.rules ??= [];
    const rules = compiler.options.module.rules;
    rules.push(routesRule(project));
    const guard = configInPageRule(project);
    if (guard !== undefined && buildsPage(compiler.options.target)) rules.push(guard);
  }
}

/* A bundle a browser runs: webpack's own default, `web`, a browserslist query, a worker. */
function buildsPage(target: unknown): boolean {
  const targets: unknown[] = Array.isArray(target) ? target : [target];
  return !targets.some((one) => typeof one === "string" && SERVER_TARGET.test(one));
}
