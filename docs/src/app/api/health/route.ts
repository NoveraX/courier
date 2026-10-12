/* What the site's container is asked whether it is up: the server answers, rendering nothing. */
export const dynamic = "force-dynamic"

export function GET(): Response {
  return Response.json({ status: "ok" })
}
