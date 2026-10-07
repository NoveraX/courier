import { accounts, outcome } from "../lib/accounts.mjs";

export const POST = async (): Promise<Response> =>
  new Response(await outcome(accounts.rename({ name: "Route" })));
