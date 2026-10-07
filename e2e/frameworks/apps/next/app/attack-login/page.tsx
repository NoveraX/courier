import { Suspense } from "react";

import { client } from "../../lib/api";

async function Outcome() {
  const outcome = await client.login({ user: "mallory" }).then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  );
  return <pre id="outcome">{outcome}</pre>;
}

/* A page that signs in while it renders: what a link on another site sets off for a visitor with no token yet. */
export default function AttackLogin() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Outcome />
    </Suspense>
  );
}
