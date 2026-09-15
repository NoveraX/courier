/**
 * Shared HTTP client for Studio UI → Studio server communication.
 * All requests go through the Vite dev server proxy → Express backend.
 */

import { createFetch } from "@noverax/courier/fetch";

export const apiClient = createFetch({ baseURL: "" });

/** POST helper with error handling — used by all Studio API modules */
export async function post<TResult>(url: string, body?: unknown): Promise<TResult> {
  return apiClient.post<TResult>(url, { json: body });
}
