import { redirect } from "react-router";

import { accounts } from "../accounts.server";

export async function loader() {
  await accounts.logout();
  return redirect("/", 303);
}
