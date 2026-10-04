import type { ModuleBindings } from "./module-bindings";
import type { MockImports } from "./read-mock-imports";

/** How a mocks file can call a function of the mock package. */
export type CalleeResolution =
  /** Through an import the file already has. */
  | { kind: "imported"; callee: string }
  /** Under its own name, once it is imported. */
  | { kind: "free"; callee: string }
  /** Not at all: its name is bound to something else, declared at `offset`. */
  | { kind: "taken"; offset: number };

/**
 * Decide how a mocks file calls `name` from the mock package: a named value
 * import of it (under any alias) wins, then a namespace import; otherwise it
 * must be imported, which only works while nothing else holds the name — a
 * local, a type-only import, or an import from another package.
 *
 * @param name - `defineMocks` or `defineMockServer`
 * @param imports - What the file imports from the mock package
 * @param bindings - Every name the file binds at its top level
 * @returns The callee to write, and whether it has to be imported
 *
 * @example
 * ```ts
 * // import * as mock from "@noverax/courier-mock";
 * resolveCallee("defineMockServer", imports, bindings); // → { kind: "imported", callee: "mock.defineMockServer" }
 * ```
 */
export function resolveCallee(
  name: string,
  imports: MockImports,
  bindings: ModuleBindings,
): CalleeResolution {
  const local = imports.named.get(name)?.[0];
  if (local !== undefined) return { kind: "imported", callee: local };
  const namespace = imports.namespaces[0];
  if (namespace !== undefined) return { kind: "imported", callee: `${namespace}.${name}` };
  const offset = bindings.get(name);
  return offset === undefined ? { kind: "free", callee: name } : { kind: "taken", offset };
}
