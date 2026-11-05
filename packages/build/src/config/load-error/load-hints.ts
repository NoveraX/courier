import { FRAMEWORK_MARKERS } from "../frameworks";
import { packageNameOf } from "../installed-packages";
import { frameworkOfImport } from "../profiles/profile-of";
import type { ResolutionProfile } from "../profiles/resolution-profile";
import { shownModule } from "./import-chain";

/** What to do about a module that could not be compiled. */
export const TRANSFORM_HINT =
  "Correct the code where the message points. JSX, and a file a framework compiles itself, such as a .vue or .svelte component, stay out of the modules the config imports.";

/** What to do about a load that never ended. */
export const TIMEOUT_HINT =
  "Something a module runs as it is imported does not end — a connection, a server, a timer it waits for. Open it in the function that needs it, not as the module loads.";

/**
 * What to do about an import that did not resolve: what the project's
 * framework says of it, or the framework whose import it is when Courier
 * reads the project as another, or else how to mend an import.
 *
 * @param specifier - The import, as written
 * @param profile - The framework Courier read the project as
 * @param project - The package.json that told it, absolute, and the project's folder
 * @returns The hint
 * @example
 * ```ts
 * notFoundHint("$env/static/private", profileOf(undefined), { manifest: "/app/package.json", folder: "/app" });
 * // → '"$env/static/private" is SvelteKit's own module. Courier reads this project as plain Node, …'
 * ```
 */
export function notFoundHint(
  specifier: string,
  profile: ResolutionProfile,
  project: { readonly manifest: string | undefined; readonly folder: string },
): string {
  const { manifest, folder } = project;
  const own = profile.unresolved?.(specifier);
  if (own !== undefined) return `"${specifier}" ${own.reason}. ${own.remedy}.`;
  const owner = FRAMEWORK_MARKERS.find((marker) => marker.id === frameworkOfImport(specifier));
  if (owner !== undefined && owner.id !== profile.framework?.id) {
    const readAs = profile.framework?.label ?? "plain Node";
    const by =
      manifest === undefined
        ? "as no package.json is in its folder or above it"
        : `by ${shownModule(manifest, folder)}`;
    return `"${specifier}" is ${owner.label}'s own module. Courier reads this project as ${readAs}, ${by}: list ${owner.marker} there if the project is built with ${owner.label}.`;
  }
  const name = /^[./]|^[A-Za-z]:[\\/]/.test(specifier) ? null : packageNameOf(specifier);
  return name === null
    ? "Correct the import, or create the module it names."
    : `Install ${name} where the project's packages are, or correct the import.`;
}

/**
 * What to do about code that threw as it was run: what the framework says of
 * a name its build provides, or how Courier runs the project.
 *
 * @param error - What the code threw
 * @param profile - The framework Courier read the project as
 * @param entryName - The entry's file name, `courier.config.ts`
 * @returns The hint
 * @example
 * ```ts
 * evaluationHint(new ReferenceError("useRuntimeConfig is not defined"), nuxtProfile, "courier.config.ts");
 * ```
 */
export function evaluationHint(
  error: unknown,
  profile: ResolutionProfile,
  entryName: string,
): string {
  const name =
    error instanceof ReferenceError ? /^(\S+) is not defined/.exec(error.message)?.[1] : undefined;
  const said = name === undefined ? undefined : profile.undefinedName?.(name);
  if (name !== undefined && said !== undefined) return `${name} ${said.reason}. ${said.remedy}.`;
  return `Courier runs ${entryName} and every module it imports, as your server would: a module that checks the environment as it is imported needs those variables set where Courier reads the project.`;
}
