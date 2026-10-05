const METHOD_TEXT: Readonly<Record<string, string>> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  PATCH: "text-method-patch",
  DELETE: "text-method-delete",
  QUERY: "text-method-query",
};

const METHOD_CHIP: Readonly<Record<string, string>> = {
  GET: "bg-method-get/13 text-method-get",
  POST: "bg-method-post/13 text-method-post",
  PUT: "bg-method-put/13 text-method-put",
  PATCH: "bg-method-patch/13 text-method-patch",
  DELETE: "bg-method-delete/13 text-method-delete",
  QUERY: "bg-method-query/13 text-method-query",
};

/**
 * The colour an HTTP method is written in; a method Studio does not colour
 * reads muted.
 *
 * @param method - The method, upper case
 * @returns The text class
 * @example
 * ```ts
 * methodText("POST"); // "text-method-post"
 * ```
 */
export function methodText(method: string): string {
  return METHOD_TEXT[method] ?? "text-fg-muted";
}

/**
 * A method's chip: its colour on a tint of it.
 *
 * @param method - The method, upper case
 * @returns The classes
 * @example
 * ```ts
 * methodChip("GET"); // "bg-method-get/13 text-method-get"
 * ```
 */
export function methodChip(method: string): string {
  return METHOD_CHIP[method] ?? "bg-raised text-fg-muted";
}
