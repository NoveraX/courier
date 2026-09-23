export function errorResponse(status: number, message: string): Response {
  return Response.json({ success: false, message }, { status });
}
