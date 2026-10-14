/**
 * The `Set-Cookie` values of an answer, each on its own, where the runtime
 * tells them apart: `Headers.getSetCookie` is missing from Safari before 17,
 * Chrome before 113, Firefox before 112 and React Native, where none are
 * read — a browser keeps the cookies an answer sets out of a script's reach
 * anyway, and React Native joins them into one value.
 *
 * @param headers - The answer's headers
 * @returns The values, or none where the runtime cannot tell them apart
 * @example
 * ```ts
 * setCookiesOf(response.headers); // ["sid=a1; Path=/; HttpOnly", "theme=dark"]
 * ```
 */
export function setCookiesOf(headers: Headers | undefined): string[] {
  return typeof headers?.getSetCookie === "function" ? headers.getSetCookie() : [];
}
