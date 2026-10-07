import { createAsync, query } from "@solidjs/router";

import { renewed } from "~/lib/session";

const getRenewed = query(renewed, "renewed");

export default function Renew() {
  const both = createAsync(() => getRenewed(), { deferStream: true });
  return <pre id="renew">{JSON.stringify(both())}</pre>;
}
