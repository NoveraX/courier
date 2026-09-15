import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveSnippet } from "./core/resolve-snippet";
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

      build.onLoad({ filter: /.*/, namespace: VIRTUAL_NS }, async () => ({
        contents: (await ensure()) ?? "",
        loader: "js" as const,
      }));

      const entryPaths = resolveEntryPaths(build.initialOptions.entryPoints);
      if (entryPaths.size === 0) return;

      build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
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

function resolveEntryPaths(entryPoints: unknown): Set<string> {
  const paths: string[] = [];

  if (Array.isArray(entryPoints)) {
    for (const entry of entryPoints) {
      if (typeof entry === "string") {
        paths.push(entry);
      } else if (typeof entry === "object" && entry !== null && "in" in entry) {
        const obj = entry as { in: unknown };
        if (typeof obj.in === "string") paths.push(obj.in);
      }
    }
  } else if (typeof entryPoints === "object" && entryPoints !== null) {
    for (const value of Object.values(entryPoints as Record<string, unknown>)) {
      if (typeof value === "string") paths.push(value);
    }
  }

  return new Set(paths.map((p) => resolve(p)));
}

function inferLoader(path: string): "ts" | "tsx" | "js" | "jsx" {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  return "js";
}

interface EsbuildPluginLike {
  name: string;
  setup(build: {
    initialOptions: { entryPoints?: unknown };
    onResolve(
      opts: { filter: RegExp },
      cb: (args: { path: string }) => { path: string; namespace: string },
    ): void;
    onLoad(
      opts: { filter: RegExp; namespace?: string },
      cb: (args: {
        path: string;
      }) =>
        | Promise<{ contents: string; loader: string } | undefined>
        | { contents: string; loader: string },
    ): void;
  }): void;
}
