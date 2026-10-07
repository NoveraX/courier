import { client } from "../../lib/api";

export async function GET(request: Request): Promise<Response> {
  await client.logout();
  return Response.redirect(new URL("/", request.url), 303);
}
