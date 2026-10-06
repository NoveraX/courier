/* The width a statement fits on one line in: Biome's and Prettier's default. */
const LINE_WIDTH = 80;

/**
 * Write an import or a re-export of names from a module, on one line when it
 * fits and one name a line when it does not, as a formatter at its defaults
 * writes it.
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
  const line = `${head} { ${names.join(", ")} } from "${from}";`;
  if (line.length <= LINE_WIDTH) return line;
  return [`${head} {`, ...names.map((name) => `  ${name},`), `} from "${from}";`].join("\n");
}
