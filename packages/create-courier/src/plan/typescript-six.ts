import { posix, relative, resolve } from "node:path";

import type { Project } from "../project/read-project";
import { type TsconfigLevel, tsconfigChain } from "../project/tsconfig-chain";
import type { ManualStep } from "../recipes/recipe-types";

/* What a project is built with when a bundler resolves its imports, rather than Node. */
const BUNDLED = [
  "next",
  "nuxt",
  "@sveltejs/kit",
  "astro",
  "@react-router/dev",
  "@remix-run/dev",
  "@solidjs/start",
  "expo",
  "vite",
];

/* Values TypeScript 6 deprecates, by option; `true` stands for any value. */
const DEPRECATED: ReadonlyArray<readonly [string, ReadonlySet<unknown> | true]> = [
  ["target", new Set(["es3", "es5"])],
  ["moduleResolution", new Set(["node", "node10", "classic"])],
  ["module", new Set(["amd", "umd", "system", "none"])],
  ["baseUrl", true],
  ["downlevelIteration", true],
  ["outFile", true],
  ["esModuleInterop", new Set([false])],
  ["allowSyntheticDefaultImports", new Set([false])],
  ["alwaysStrict", new Set([false])],
];

/* The level that sets an option: the first that names it. */
function setting(chain: readonly TsconfigLevel[], name: string): TsconfigLevel | undefined {
  return chain.find((level) => Object.hasOwn(level.options, name));
}

function deprecatedIn(chain: readonly TsconfigLevel[]): string[] {
  return DEPRECATED.flatMap(([name, values]) => {
    const value = setting(chain, name)?.options[name];
    if (value === undefined) return [];
    const normalized = typeof value === "string" ? value.toLowerCase() : value;
    if (values !== true && !values.has(normalized)) return [];
    return [values === true ? name : `${name} ${JSON.stringify(value)}`];
  });
}

/* Each of `paths`, written relative to the tsconfig, as it reads without `baseUrl`. */
function pathsWithoutBaseUrl(root: string, chain: readonly TsconfigLevel[]): string | undefined {
  const base = setting(chain, "baseUrl");
  const paths = setting(chain, "paths")?.options.paths;
  if (base === undefined || typeof base.options.baseUrl !== "string" || paths === null)
    return undefined;
  if (typeof paths !== "object") return undefined;
  const from = resolve(base.dir, base.options.baseUrl);
  const entries: [string, unknown][] = Object.entries(paths);
  const rewritten = entries.map(([alias, targets]) => {
    const list = Array.isArray(targets) ? targets : [];
    const relativeTo = list.map((target) => {
      const path = relative(root, resolve(from, String(target)))
        .split("\\")
        .join(posix.sep);
      return JSON.stringify(path.startsWith(".") ? path : `./${path}`);
    });
    return `${JSON.stringify(alias)}: [${relativeTo.join(", ")}]`;
  });
  return `"paths": { ${rewritten.join(", ")} },`;
}

/**
 * What moving to TypeScript 6 asks of a project's `tsconfig.json`: the
 * options it deprecates that the project sets — `moduleResolution: "node"`,
 * `baseUrl`, `downlevelIteration`, an ES5 target among them — with what to
 * set instead, and that it checks side-effect imports such as
 * `import "swiper/css"`.
 *
 * @param project - The project
 * @returns The step, or nothing where its tsconfig sets none of them
 * @example
 * ```ts
 * typescriptSixStep(project)?.what; // "TypeScript 6 deprecates what tsconfig.json sets: …"
 * ```
 */
export function typescriptSixStep(project: Project): ManualStep | undefined {
  const chain = tsconfigChain(project.root);
  const found = deprecatedIn(chain);
  if (found.length === 0) return undefined;
  const bundled = BUNDLED.some((name) => project.lists(name));
  const resolution = setting(chain, "moduleResolution")?.options.moduleResolution;
  const lines = [
    ...(typeof resolution === "string" &&
    ["node", "node10", "classic"].includes(resolution.toLowerCase())
      ? [bundled ? '"moduleResolution": "bundler",' : '"module": "node16",']
      : []),
    ...(found.includes("baseUrl") ? [pathsWithoutBaseUrl(project.root, chain) ?? ""] : []),
  ].filter((line) => line !== "");
  return {
    file: "tsconfig.json",
    what: `TypeScript 6 deprecates what tsconfig.json sets: ${found.join(", ")}. Change it as you move — removing what has no replacement below — or set "ignoreDeprecations": "6.0" until then. TypeScript 6 also checks side-effect imports such as import "swiper/css": declare them, or set "noUncheckedSideEffectImports": false`,
    lines,
  };
}
