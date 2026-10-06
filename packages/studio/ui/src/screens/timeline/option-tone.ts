/* The text colour each named tone gives a filter's value: its state's, its method's, its transport's. */
const TONE_CLASS: Readonly<Record<string, string>> = {
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  brand: "text-brand",
  muted: "text-fg-subtle",
  keyword: "text-syntax-keyword",
  get: "text-method-get",
  post: "text-method-post",
  put: "text-method-put",
  patch: "text-method-patch",
  delete: "text-method-delete",
  query: "text-method-query",
};

/**
 * The colour a filter's value is written in: the one its tone names — a
 * state's, a method's, a transport's — or the text's own for a value Studio
 * does not colour.
 *
 * @param tone - The tone's name, as the filter's options give it
 * @returns The text colour class
 * @example
 * ```ts
 * optionTone("err"); // "text-err"
 * optionTone(undefined); // "text-fg"
 * ```
 */
export function optionTone(tone: string | undefined): string {
  return (tone === undefined ? undefined : TONE_CLASS[tone]) ?? "text-fg";
}
