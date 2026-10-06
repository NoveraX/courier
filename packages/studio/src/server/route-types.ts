/**
 * Shared types for Express-like route registration.
 */

export interface JsonResponse {
  status(code: number): JsonResponse;
  json(data: unknown): void;
}

/** What a route reads of a request: its body, and its headers by name. */
export interface RouteRequest {
  body: unknown;
  get?(name: string): string | undefined;
}

export interface RouteApp {
  post(
    path: string,
    /* `body` is whatever the JSON parser made of the request, and absent without one. */
    handler: (req: RouteRequest, res: JsonResponse) => void | Promise<void>,
  ): void;
}
