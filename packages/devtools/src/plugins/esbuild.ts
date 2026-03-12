import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startDevToolsServer } from "./core/auto-start";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";

const VIRTUAL_NS = "nexus-devtools";
const VIRTUAL_ID = "nexus-devtools-init";

/**
 * esbuild plugin for Nexus DevTools.
 * Injects `connectDevTools()` into entry points in dev mode.
 *
 * @example
 * ```ts
 * import { nexusDevTools } from "@noverax/nexus-devtools/esbuild"
 *
 * await esbuild.build({
 *   plugins: [nexusDevTools()],
 * })
 * ```
 */
export function nexusDevTools(options?: DevToolsPluginOptions): EsbuildPluginLike {
  const resolved = resolveOptions(options);

  return {
    name: "nexus-devtools",
    setup(build) {
      if (!resolved.enabled) return;

      if (resolved.autoStart) {
        startDevToolsServer(resolved);
      }

      build.onResolve({ filter: new RegExp(`^${VIRTUAL_ID}$`) }, () => ({
        path: VIRTUAL_ID,
        namespace: VIRTUAL_NS,
      }));

      build.onLoad({ filter: /.*/, namespace: VIRTUAL_NS }, () => ({
        contents: generateConnectSnippet(resolved),
        loader: "js" as const,
      }));

      const entryPaths = resolveEntryPaths(build.initialOptions.entryPoints);

      if (entryPaths.size > 0) {
        build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
          if (!entryPaths.has(args.path)) return undefined;
          const source = await readFile(args.path, "utf-8");
          return {
            contents: `import "${VIRTUAL_ID}"\n${source}`,
            loader: inferLoader(args.path),
          };
        });
      }
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
