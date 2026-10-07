import { createAsync, query } from "@solidjs/router";

import { renameForAnotherSite } from "~/lib/session";

const attempt = query(renameForAnotherSite, "attack");

export default function Attack() {
  const written = createAsync(() => attempt(), { deferStream: true });
  return <pre id="outcome">{written()}</pre>;
}
