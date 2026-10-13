import { StudioRequestError } from "./studio-request-error";

/** The code Studio refuses a request with when the page did not present the project's token. */
export const TOKEN_REQUIRED = "STUDIO_TOKEN_REQUIRED";

/**
 * Whether Studio refused a request for want of the project's token: the
 * page was opened otherwise than from the link Studio printed in its
 * terminal, which carries it — or the page visits a public demo.
 *
 * @param error - What a request to Studio threw
 * @returns Whether it is that refusal
 * @example
 * ```ts
 * try {
 *   await post("/api/editor/sites", { source, endpoint });
 * } catch (error) {
 *   if (isTokenRefusal(error)) showLinkNeeded();
 * }
 * ```
 */
export function isTokenRefusal(error: unknown): boolean {
  return error instanceof StudioRequestError && error.code === TOKEN_REQUIRED;
}
