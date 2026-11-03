import {
  type CourierRoutesOptions,
  configInPageRule,
  routesProject,
  routesRule,
} from "@noverax/courier-build/webpack";

/** What of a webpack or Rspack config Nuxt hands its config hooks the module adds its rules to. */
export interface NuxtBundlerConfig {
  /** `"client"` for the pages' bundle, `"server"` for the bundle that renders them. */
  readonly name?: string | undefined;
  module?: { rules?: unknown[] } | undefined;
}

/**
 * What Nuxt's `webpack:config` and `rspack:config` hooks are handed: the
 * config of each bundle, and the hook adds the rules that build the routes
 * in place of the module `@noverax/courier/routes` ships to every one, and
 * fail the pages' bundle where it takes the config itself.
 *
 * @param root - The app's root, Nuxt's `rootDir`
 * @param options - Where the config is, when it is not found from the root
 * @returns The hook
 * @example
 * ```ts
 * nuxt.hook("webpack:config", bundlerRoutesHook(nuxt.options.rootDir, options));
 * ```
 */
export function bundlerRoutesHook(
  root: string,
  options: CourierRoutesOptions,
): (configs: NuxtBundlerConfig[]) => void {
  const project = routesProject(root, options);
  const guard = configInPageRule(project);
  return (configs) => {
    for (const config of configs) {
      config.module ??= {};
      config.module.rules ??= [];
      const rules = config.module.rules;
      rules.push(routesRule(project));
      if (guard !== undefined && config.name === "client") rules.push(guard);
    }
  };
}
