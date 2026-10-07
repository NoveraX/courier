import { accounts, outcome } from "../accounts.server";

export async function action() {
  return new Response(await outcome(accounts.rename({ name: "Route" })));
}
