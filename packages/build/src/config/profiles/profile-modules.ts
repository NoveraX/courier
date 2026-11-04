import { RefusedModuleError } from "./refused-module-error";
import type { ResolutionProfile } from "./resolution-profile";

/* What an import of a marker of server code gets: nothing to read. */
const EMPTY: object = Object.freeze({});

/**
 * A profile's imports, in the shape the module loader's `virtualModules`
 * take: each answered before the loader resolves the import, in every module
 * of the load. A `provided` module is made when the load first imports it,
 * and a `refused` one throws there, in the module that imports it. An import
 * the project's own path aliases send elsewhere is left to them: the project
 * says what it is.
 *
 * @param profile - How the framework's server answers its imports
 * @param aliases - The project's path aliases, prefix → target
 * @returns The modules, by specifier
 * @example
 * ```ts
 * createJiti(file, { virtualModules: profileModules(profile, aliases) });
 * ```
 */
export function profileModules(
  profile: ResolutionProfile,
  aliases: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const modules: Record<string, unknown> = {};
  for (const [specifier, rule] of profile.modules) {
    if (isAliased(specifier, aliases)) continue;
    let made: object | undefined;
    Object.defineProperty(modules, specifier, {
      enumerable: true,
      get: (): object => {
        if (rule.kind === "refused")
          throw new RefusedModuleError(specifier, rule, profile.framework);
        if (rule.kind === "empty") return EMPTY;
        made ??= rule.exports();
        return made;
      },
    });
  }
  return modules;
}

/* Whether an alias the loader applies covers the specifier: the alias itself, or a prefix of it. */
function isAliased(specifier: string, aliases: Readonly<Record<string, string>>): boolean {
  return Object.keys(aliases).some(
    (prefix) =>
      specifier === prefix || specifier.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}
