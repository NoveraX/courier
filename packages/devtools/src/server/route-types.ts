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
    handler: (req: { body: Record<string, unknown> }, res: JsonResponse) => void | Promise<void>,
  ): void;
}
