import { readFile } from "node:fs/promises";
import { entryPathsOf } from "./core/entry-paths";
import { resolveSnippet } from "./core/resolve-snippet";
import { RUNTIME_IMPORTER_DIR } from "./core/runtime-importer";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "esbuild";
const VIRTUAL_NS = "courier-studio";
const VIRTUAL_ID = "courier-studio-init";

/**
 * esbuild plugin for Courier Studio.
 * Injects `attachRuntime("esbuild-browser")` into entry points in dev mode.
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
      let pending: Promise<string | null> | null = null;
      const ensure = (): Promise<string | null> => (pending ??= resolveSnippet(FRAMEWORK, options));

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

interface EsbuildPluginLike {
  name: string;
  setup(build: {
    initialOptions: { entryPoints?: unknown; absWorkingDir?: string };
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
