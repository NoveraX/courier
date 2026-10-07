import { accounts, outcome } from "~/lib/accounts";

export async function POST(): Promise<Response> {
  return new Response(await outcome(accounts.rename({ name: "Route" })));
}
