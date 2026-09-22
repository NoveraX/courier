/**
 * Shared HTTP client for Studio UI → Studio server communication.
 * All requests go through the Vite dev server proxy → Express backend.
 */

import { createFetch, isHTTPError } from "@noverax/courier";

export const apiClient = createFetch({ baseURL: "" });

/**
 * Read the reason the server gave for refusing a request.
 *
 * Every Studio route answers a failure with `{ error }`, but an `HTTPError`
 * is only ever titled with its status — so the refusal that actually explains
 * itself ("Blocked request to loopback address") reached the screen as a bare
 * "HTTP 400".
 */
function serverReason(error: unknown): string | undefined {
  if (!isHTTPError(error)) return undefined;
  const data = error.data;
  if (typeof data !== "object" || data === null) return undefined;
  const reason = (data as { error?: unknown }).error;
  return typeof reason === "string" && reason !== "" ? reason : undefined;
}

/** POST helper with error handling — used by all Studio API modules */
export async function post<TResult>(url: string, body?: unknown): Promise<TResult> {
  try {
    return await apiClient.post<TResult>(url, { json: body });
  } catch (error) {
    const reason = serverReason(error);
    if (reason === undefined) throw error;
    throw new Error(reason, { cause: error });
  }
}
