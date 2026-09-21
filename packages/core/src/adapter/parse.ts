const META_KEYS = new Set(["_s", "_g", "_m", "_o", "_transport"]);

export { META_KEYS };

export function errorResponse(status: number, message: string): Response {
  return Response.json({ success: false, message }, { status });
}
