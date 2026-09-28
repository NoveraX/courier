/**
 * Shared types for Express-like route registration.
 */

export interface JsonResponse {
  status(code: number): JsonResponse;
  json(data: unknown): void;
}

export interface RouteApp {
  post(
    path: string,
    /* `body` is whatever the JSON parser made of the request, and absent without one. */
    handler: (req: { body: unknown }, res: JsonResponse) => void | Promise<void>,
  ): void;
}
