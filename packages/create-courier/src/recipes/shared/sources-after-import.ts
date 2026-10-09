import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { defaultExportLiteral, propertyLiteral } from "../../edit/literal";
import { scanSource } from "../../edit/source-scan";
import type { RecipeFile } from "../recipe-types";

/* The names courier.config.ts lists under sources, and the module each is imported from, relative to the root. */
function declaredSources(config: string): Array<{ name: string; from: string }> {
  const scan = scanSource(config);
  const object = scan === undefined ? undefined : defaultExportLiteral(scan, ["defineConfig"]);
  const sources = scan && object ? propertyLiteral(scan, object, "sources") : undefined;
  if (!scan || !sources) return [];
  const imported = new Map<string, string>();
  for (const [, names = "", from = ""] of config.matchAll(
    /^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm,
  )) {
    for (const name of names.split(",").map(
      (part) =>
        part
          .trim()
          .split(/\s+as\s+/)
          .at(-1) ?? "",
    )) {
      if (name !== "" && from.startsWith(".")) imported.set(name, from);
    }
  }
  return config
    .slice(sources.open + 1, sources.close)
    .split(",")
    .map((entry) => /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(entry)?.[1] ?? "")
    .flatMap((name) => {
      const from = imported.get(name);
      return from === undefined ? [] : [{ name, from }];
    });
}

/**
 * After a specification is imported into a server's project, its list of
 * APIs: the ones courier.config.ts declares — the import adds its API
 * there — imported in `sources.ts` beside the server's code, which a
 * server TypeScript compiles from `src/` registers as it starts.
 *
 * @param dir - The folder Courier's modules go in, relative to the root
 * @returns What writes the file, from the project's config once the import has run
 * @example
 * ```ts
 * sourcesAfterImport("src/courier")("/work/api"); // [{ path: "src/courier/sources.ts", … }]
 * ```
 */
export function sourcesAfterImport(dir: string): (root: string) => RecipeFile[] {
  return (root) => {
    const declared = declaredSources(readFileSync(join(root, "courier.config.ts"), "utf8"));
    if (declared.length === 0) return [];
    const path = `${dir}/sources.ts`;
    const imports = declared.map(({ name, from }) => {
      const relative = posix.relative(dir, posix.normalize(from));
      return `import { ${name} } from "${relative.startsWith(".") ? relative : `./${relative}`}";`;
    });
    const names = declared.map(({ name }) => name).join(", ");
    const content = `${imports.join("\n")}

/**
 * The APIs this server answers for at /api/request, registered as it
 * starts. courier.config.ts lists them too, for Studio and agents: an API
 * you add there, add here as well.
 */
export const sources = { ${names} };
`;
    return [{ path, content, purpose: "the APIs the server registers as it starts" }];
  };
}
