/**
 * The Studio row a stream asks to be shown under, from the options it was
 * opened with. Studio names one when it opens the stream itself — a replay,
 * a Playground run — so the row it then follows is the stream's; a stream
 * an application opens names none and is given a fresh id.
 *
 * @param options - The options the stream was opened with
 * @returns The row's id, or `undefined` when the options name none
 * @example
 * ```ts
 * studioRequestIdOption({ studioRequestId: "pg_6f1c…" }); // → "pg_6f1c…"
 * ```
 */
export function studioRequestIdOption(
  options: Record<string, unknown> | undefined,
): string | undefined {
  const id = options?.studioRequestId;
  return typeof id === "string" ? id : undefined;
}
