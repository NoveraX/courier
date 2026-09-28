import type { BindingPattern, BindingRestElement } from "oxc-parser";

/**
 * The names a declaration's pattern binds: `a` in `const a`, `a` and `c` in
 * `const { a, b: [c] }`, through defaults and rest elements.
 *
 * @param pattern - The declared pattern
 * @returns The names it binds, in the order written
 * @example
 * ```ts
 * patternNames(declarator.id); // `const { a, b: [c = 1], ...d } = o` → ["a", "c", "d"]
 * ```
 */
export function patternNames(pattern: BindingPattern | BindingRestElement): string[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "AssignmentPattern":
      return patternNames(pattern.left);
    case "RestElement":
      return patternNames(pattern.argument);
    case "ArrayPattern":
      return pattern.elements.flatMap((element) => (element ? patternNames(element) : []));
    case "ObjectPattern":
      return pattern.properties.flatMap((property) =>
        patternNames(property.type === "RestElement" ? property : property.value),
      );
  }
}
