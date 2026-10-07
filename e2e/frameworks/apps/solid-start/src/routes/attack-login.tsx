import { createAsync, query } from "@solidjs/router";

import { signInForAnotherSite } from "~/lib/session";

const attempt = query(signInForAnotherSite, "attack-login");

export default function AttackLogin() {
  const written = createAsync(() => attempt(), { deferStream: true });
  return <pre id="outcome">{written()}</pre>;
}
