import { readFile } from "node:fs/promises";
import { entryPathsOf } from "./core/entry-paths";
import { isInjectionEnabled } from "./core/options";
import { resolveSnippet } from "./core/resolve-snippet";
import { RUNTIME_IMPORTER_DIR } from "./core/runtime-importer";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "esbuild";
const VIRTUAL_NS = "courier-studio";
const VIRTUAL_ID = "courier-studio-init";

/** A `define` value that makes `process.env.NODE_ENV` the string "production". */
const PRODUCTION_DEFINE = /^\s*(["'`])production\1\s*$/;

/**
 * esbuild plugin for Courier Studio.
 *
 * Injects `attachRuntime("esbuild-browser")` into the entry points of a
 * development build. esbuild has no mode, so the build is taken for what
 * esbuild itself makes `process.env.NODE_ENV` in a browser bundle: what
 * `define` sets it to, or else `"production"` when the build minifies
 * whitespace, identifiers and syntax — as `minify: true` does.
 *
 * @param options - `enabled` forces injection on or off; by default it is on
 *   in a development build unless `NODE_ENV` is `"production"`.
 * @returns The esbuild plugin.
 *
 * @example
 * ```ts
 * import { courierStudio } from "@noverax/courier-studio/esbuild"
 *
 * await esbuild.build({
 *   plugins: [courierStudio()],
 * })
 * ```
 */
export function courierStudio(options?: StudioPluginOptions): EsbuildPluginLike {
  return {
    name: "courier-studio",
    setup(build) {
      const development = !buildsForProduction(build.initialOptions);
      if (!isInjectionEnabled(options, development)) return;
      let pending: Promise<string | null> | null = null;
      const ensure = (): Promise<string | null> =>
        (pending ??= resolveSnippet({ framework: FRAMEWORK, options, development }));

      build.onResolve({ filter: new RegExp(`^${VIRTUAL_ID}$`) }, () => ({
        path: VIRTUAL_ID,
        namespace: VIRTUAL_NS,
      }));

      /* A module in a namespace of its own has no directory to resolve its
         imports from, so esbuild could not find the runtime and failed the
         whole build. */
      build.onLoad({ filter: /.*/, namespace: VIRTUAL_NS }, async () => ({
        contents: (await ensure()) ?? "",
        loader: "js" as const,
        resolveDir: RUNTIME_IMPORTER_DIR,
      }));

      const { entryPoints, absWorkingDir } = build.initialOptions;
      const entryPaths = entryPathsOf(entryPoints, absWorkingDir);
      if (entryPaths.size === 0) return;

      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        if (!entryPaths.has(args.path)) return undefined;
        const snippet = await ensure();
        if (!snippet) return undefined;
        const source = await readFile(args.path, "utf-8");
        return {
          contents: `import "${VIRTUAL_ID}"\n${source}`,
          loader: inferLoader(args.path),
        };
      });
    },
  };
}

/**
 * Whether esbuild builds for production: whether it gives the bundle a
 * `process.env.NODE_ENV` of `"production"`.
 */
function buildsForProduction(build: EsbuildBuildOptions): boolean {
  const defined = build.define?.["process.env.NODE_ENV"];
  if (defined !== undefined) return PRODUCTION_DEFINE.test(defined);
  if (build.minify === true) return true;
  return (
    build.minifyWhitespace === true &&
    build.minifyIdentifiers === true &&
    build.minifySyntax === true
  );
}

type EsbuildLoader = "ts" | "tsx" | "js" | "jsx";

function inferLoader(path: string): EsbuildLoader {
  if (path.endsWith(".tsx")) return "tsx";
  if (/\.[cm]?ts$/.test(path)) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  return "js";
}

/** What an onLoad callback returns; the loader is a literal, as esbuild's `Plugin` type requires. */
interface EsbuildLoadResult {
  contents: string;
  loader: EsbuildLoader;
  resolveDir?: string;
}

/** The build options this plugin reads. */
interface EsbuildBuildOptions {
  entryPoints?: unknown;
  absWorkingDir?: string;
  define?: Record<string, string>;
  minify?: boolean;
  minifyWhitespace?: boolean;
  minifyIdentifiers?: boolean;
  minifySyntax?: boolean;
}

interface EsbuildPluginLike {
  name: string;
  setup(build: {
    initialOptions: EsbuildBuildOptions;
    onResolve(
      opts: { filter: RegExp },
      cb: (args: { path: string }) => { path: string; namespace: string },
    ): void;
    onLoad(
      opts: { filter: RegExp; namespace?: string },
      cb: (args: { path: string }) => Promise<EsbuildLoadResult | undefined>,
    ): void;
  }): void;
}
