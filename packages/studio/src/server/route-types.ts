/**
 * Shared types for Express-like route registration.
 */

export interface JsonResponse {
  status(code: number): JsonResponse;
  json(data: unknown): void;
}

/** What a route reads of a request: its body, its headers by name, and where it came from. */
export interface RouteRequest {
  body: unknown;
  get?(name: string): string | undefined;
  /** The connection it came on, whose peer says which machine sent it. */
  socket?: { remoteAddress?: string | undefined } | undefined;
}

export interface RouteApp {
  post(
    path: string,
    /* `body` is whatever the JSON parser made of the request, and absent without one. */
    handler: (req: RouteRequest, res: JsonResponse) => void | Promise<void>,
  ): void;
}
