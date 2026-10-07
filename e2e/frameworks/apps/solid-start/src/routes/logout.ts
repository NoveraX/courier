import { redirect } from "@solidjs/router";

import { accounts } from "~/lib/accounts";

export async function GET(): Promise<Response> {
  await accounts.logout();
  return redirect("/", 303);
}
