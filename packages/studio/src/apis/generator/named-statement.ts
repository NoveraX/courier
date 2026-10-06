import { compareNames } from "./import-order";

/* The width a statement fits on one line in: Biome's and Prettier's default. */
const LINE_WIDTH = 80;

/* The name an entry imports or exports, whatever `type` marks it. */
function nameOf(entry: string): string {
  return entry.replace(/^type\s+/, "");
}

/**
 * Write an import or a re-export of names from a module, on one line when it
 * fits and one name a line when it does not, as a formatter at its defaults
 * writes it, the names in the order Biome's import organizer keeps them.
 *
 * @param head - What opens the statement: `import`, `import type` or `export`
 * @param names - The names, each with its own `type` where it needs one
 * @param from - The module specifier
 * @returns The statement
 * @example
 * ```ts
 * namedStatement("export", ["type Pet", "PetSchema"], "./pets/schemas");
 * // → 'export { type Pet, PetSchema } from "./pets/schemas";'
 * ```
 */
export function namedStatement(head: string, names: readonly string[], from: string): string {
  const sorted = [...names].sort((a, b) => compareNames(nameOf(a), nameOf(b)));
  const line = `${head} { ${sorted.join(", ")} } from "${from}";`;
  if (line.length <= LINE_WIDTH) return line;
  return [`${head} {`, ...sorted.map((name) => `  ${name},`), `} from "${from}";`].join("\n");
}
