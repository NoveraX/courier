import { redirect } from "@sveltejs/kit";
import { client } from "$lib/server/api";

export async function GET() {
  await client.logout();
  redirect(303, "/");
}
