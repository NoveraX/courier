const DESTRUCTURED = /const\s*\{([^}]*)\}\s*=\s*\w*courier/i;

/**
 * A file's preamble made to name the stream builder, for a merge that brings
 * the file its first stream of events: `stream` added to the builders its
 * `courier()` call is destructured into, or a declaration of its own after
 * the preamble when it destructures none.
 *
 * @param preamble - The lines between the file's imports and its declaration
 * @returns The lines, naming `stream`
 * @example
 * ```ts
 * withStreamBuilder(["const { endpoint } = courier();"]); // → ["const { endpoint, stream } = courier();"]
 * ```
 */
export function withStreamBuilder(preamble: readonly string[]): string[] {
  const at = preamble.findIndex((line) => DESTRUCTURED.test(line));
  if (at === -1) return [...preamble, "const { stream } = courier();"];
  return preamble.map((line, index) =>
    index === at
      ? line.replace(/\{([^}]*)\}/, (_, inner: string) => {
          const names = inner
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean);
          return `{ ${[...names, "stream"].join(", ")} }`;
        })
      : line,
  );
}
