import { join, resolve } from "node:path";
import type { TsdownPlugin } from "tsdown";

/**
 * The modules only a server runs whose place in a page's bundle a module
 * of the same name under `src/browser/` takes: the terminal logger, the
 * chain of addresses a request came through, and the check of `forward`.
 * The package's `imports` field sends a bundler that builds for the
 * browser to `lib/browser/`, and everything else — Node, Edge, React
 * Native — to the modules themselves.
 */
export const SERVER_ONLY_MODULES = [
  "logger/server",
  "utils/forwarded-for",
  "session/validate-forward",
] as const;

const SOURCE = resolve(import.meta.dirname, "src");

/* The package's own: a framework may alias a shorter one for every module, a package's too —
   Nuxt sends `#server/…` to the application's `server/` directory. */
const PREFIX = "#courier-server/";

/**
 * The entry points the published code needs besides the package's own:
 * each server-only module and its browser stand-in, which no relative
 * import reaches once {@link serverOnlyImports} has rewritten them.
 *
 * @returns The entries, by the path they are written to under `lib/`
 * @example
 * ```ts
 * defineConfig({ entry: { ...entry, ...serverOnlyEntries() } });
 * ```
 */
export function serverOnlyEntries(): Record<string, string> {
  return Object.fromEntries(
    SERVER_ONLY_MODULES.flatMap((module) => [
      [module, `src/${module}.ts`],
      [`browser/${module}`, `src/browser/${module}.ts`],
    ]),
  );
}

/**
 * Rewrite each relative import of a server-only module to `#courier-server/…`,
 * which the package's `imports` field resolves for the build that reads
 * it: a page's to the browser stand-in, a server's to the module itself.
 *
 * @returns The plugin
 * @example
 * ```ts
 * defineConfig({ plugins: [serverOnlyImports()] });
 * ```
 */
export function serverOnlyImports(): TsdownPlugin {
  const modules = new Map(
    SERVER_ONLY_MODULES.map((module) => [join(SOURCE, `${module}.ts`), module]),
  );
  return {
    name: "courier:server-only-imports",
    async resolveId(source, importer, options) {
      if (importer === undefined || !source.startsWith(".")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const module = resolved === null ? undefined : modules.get(resolved.id);
      if (module === undefined) return null;
      return { id: `${PREFIX}${module}.js`, external: true };
    },
  };
}
