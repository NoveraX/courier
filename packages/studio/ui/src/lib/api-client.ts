/**
 * Shared HTTP client for Studio UI → Studio server communication.
 * All requests go through the Vite dev server proxy → Express backend.
 */

import { createFetch, isHTTPError } from "@noverax/courier";

import { isPlainObject } from "@/socket/is-plain-object";
import { StudioRequestError } from "./studio-request-error";

export const apiClient = createFetch({ baseURL: "" });

/**
 * Turn a refusal into the error Studio explained it with.
 *
 * Every Studio route answers a failure with `{ error }`, but an `HTTPError`
 * is only ever titled with its status — so the refusal that actually explains
 * itself ("Blocked request to loopback address") reached the screen as a bare
 * "HTTP 400". An answer that explains nothing leaves the error as it was.
 */
function refusal(error: unknown): StudioRequestError | undefined {
  if (!isHTTPError(error) || !isPlainObject(error.data)) return undefined;
  const reason = error.data.error;
  if (typeof reason !== "string" || reason === "") return undefined;
  return new StudioRequestError(reason, error.data, error);
}

/**
 * POST to a Studio route.
 *
 * @param url - The route
 * @param body - The JSON body
 * @returns The decoded answer
 * @throws {StudioRequestError} When Studio refused the request and said why
 * @example
 * ```ts
 * const spec = await post<ParsedSpec>("/api/apis/parse", { source: "url", content: url });
 * ```
 */
export async function post<TResult>(url: string, body?: unknown): Promise<TResult> {
  try {
    return await apiClient.post<TResult>(url, { json: body });
  } catch (error) {
    throw refusal(error) ?? error;
  }
}
