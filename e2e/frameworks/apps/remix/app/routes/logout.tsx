import { redirect } from "@remix-run/node";

import { accounts } from "../accounts.server";

export async function loader() {
  await accounts.logout();
  return redirect("/", 303);
}
