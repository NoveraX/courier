import { isAbsolute, relative, resolve } from "node:path";
import {
  type CourierRoutesOptions,
  type RoutesProject,
  routesProject,
} from "@noverax/courier-build/webpack";

import { ConfigOutsideRootError } from "./config-outside-root-error";
import { ExternalCoreError } from "./external-core-error";
import { type NextVersion, nextVersion } from "./next-version";
import { turbopackRoutesRules } from "./turbopack-routes-rules";
import { type NextWebpack, type NextWebpackConfig, withRoutesWebpack } from "./webpack-routes";

/** The package the routes module ships in: a server's bundle must build it in. */
const CORE = "@noverax/courier";

/** What of a Next.js config the plugin reads and extends: every version's `NextConfig` is one. */
export interface NextConfigShape {
  transpilePackages?: string[] | undefined;
  serverExternalPackages?: string[] | undefined;
  turbopack?:
    | { root?: string | undefined; rules?: Record<string, unknown> | undefined }
    | undefined;
  experimental?: object | undefined;
  webpack?: unknown;
}

/**
 * The app's Next.js config, with the rules that build the routes in place of
 * the module `@noverax/courier/routes` ships under Turbopack and webpack,
 * fail a page's bundle that takes the config itself, and take the package
 * into the Pages Router server's bundle, so the routes reach it too.
 *
 * @param nextConfig - The app's config
 * @param options - Where the config is, when it is not found from the root
 * @param root - The app's folder, where its packages resolve from
 * @returns The config, with Courier's rules beside the app's own
 * @throws ExternalCoreError when `serverExternalPackages` keeps `@noverax/courier` out of the server's bundle
 * @throws ConfigOutsideRootError when the config lies outside `turbopack.root`
 * @throws TypeError for a config written as a function, whose object it would lose
 * @example
 * ```ts
 * withRoutesConfig({ reactStrictMode: true }, {}, "/app");
 * ```
 */
export function withRoutesConfig<TConfig extends object>(
  nextConfig: TConfig & NextConfigShape,
  options: CourierRoutesOptions,
  root: string,
): TConfig & NextConfigShape {
  if (typeof nextConfig === "function") {
    throw new TypeError(
      "[courier] withCourier() takes the config's object: a config written as a function calls it on the object it returns.",
    );
  }
  const project = routesProject(root, options);
  refuseExternalCore(nextConfig);
  refuseConfigOutsideRoot(nextConfig, project);
  return Object.assign({}, nextConfig, {
    transpilePackages: withCore(nextConfig.transpilePackages),
    webpack: withRoutesWebpack(project, ownWebpack(nextConfig.webpack), options.config),
    ...turbopackPart(nextConfig, project, nextVersion(root)),
  });
}

function withCore(packages: string[] | undefined): string[] {
  return packages?.includes(CORE) ? packages : [...(packages ?? []), CORE];
}

/* The rules under the key the app's Next.js reads them from: `turbopack` from 15.3, `experimental.turbo` before. */
function turbopackPart(
  config: NextConfigShape,
  project: RoutesProject,
  version: NextVersion,
): Pick<NextConfigShape, "turbopack" | "experimental"> {
  const rules = turbopackRoutesRules(project, version);
  if (version.major > 15 || (version.major === 15 && version.minor >= 3)) {
    return { turbopack: { ...config.turbopack, rules: { ...config.turbopack?.rules, ...rules } } };
  }
  const experimental = config.experimental ?? {};
  const turbo = recordOf(Reflect.get(experimental, "turbo"));
  return {
    experimental: {
      ...experimental,
      turbo: { ...turbo, rules: { ...recordOf(turbo.rules), ...rules } },
    },
  };
}

function refuseExternalCore(config: NextConfigShape): void {
  const experimental = recordOf(config.experimental);
  const external = [
    ...(config.serverExternalPackages ?? []),
    ...listOf(experimental.serverComponentsExternalPackages),
  ];
  if (external.includes(CORE)) throw new ExternalCoreError();
}

function refuseConfigOutsideRoot(config: NextConfigShape, project: RoutesProject): void {
  const root = config.turbopack?.root;
  if (root === undefined || project.configFile === undefined) return;
  const path = relative(resolve(root), project.configFile);
  if (path.startsWith("..") || isAbsolute(path)) {
    throw new ConfigOutsideRootError(project.configFile, root);
  }
}

/* The app's own `webpack` function, whose result must be a config, as Next.js takes it. */
function ownWebpack(value: unknown): NextWebpack | undefined {
  if (typeof value !== "function") return undefined;
  return (config, context) => {
    const built: unknown = Reflect.apply(value, undefined, [config, context]);
    if (!isWebpackConfig(built)) {
      throw new TypeError("[courier] The app's webpack function returned no config.");
    }
    return built;
  };
}

function isWebpackConfig(value: unknown): value is NextWebpackConfig {
  if (typeof value !== "object" || value === null) return false;
  const module: unknown = Reflect.get(value, "module");
  return module === undefined || (typeof module === "object" && module !== null);
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? { ...value } : {};
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
