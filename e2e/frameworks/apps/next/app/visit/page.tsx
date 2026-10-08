import { Suspense } from "react";

import { client } from "../../lib/api";

async function Outcome() {
  const outcome = await client.login({ user: "guest" }).then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  );
  return <pre id="visit">{outcome}</pre>;
}

/* A page that writes while it renders, which cannot hand the browser a cookie: the middleware hands it the token first. */
export default function Visit() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Outcome />
    </Suspense>
  );
}
