import { type Project, tsconfigProjects } from "@noverax/create-courier/engine";

/* What `importsNotUsedAsValues` keeps an import of types as. */
const KEPT = new Set(["preserve", "error"]);

/**
 * Whether a package's TypeScript keeps an import of types named one by
 * one — `import { type X }` — as a load of its module, `import {}`: one
 * of its tsconfig projects sets `verbatimModuleSyntax` or
 * `preserveValueImports`, or `importsNotUsedAsValues` to `preserve` or
 * `error`, by the first level that names it. A tsconfig that does not
 * read is taken to keep it.
 *
 * @param project - The package
 * @returns Whether it keeps such an import
 * @example
 * ```ts
 * keepsTypeImports(readProject("/work/app")); // true for Vite's template, whose tsconfig.app.json sets verbatimModuleSyntax
 * ```
 */
export function keepsTypeImports(project: Project | undefined): boolean {
  if (project === undefined) return false;
  let projects: ReturnType<typeof tsconfigProjects>;
  try {
    projects = tsconfigProjects(project.root);
  } catch {
    return true;
  }
  return projects.some((levels) => {
    const option = (name: string) => levels.find((level) => name in level.options)?.options[name];
    return (
      option("verbatimModuleSyntax") === true ||
      option("preserveValueImports") === true ||
      KEPT.has(String(option("importsNotUsedAsValues")))
    );
  });
}
