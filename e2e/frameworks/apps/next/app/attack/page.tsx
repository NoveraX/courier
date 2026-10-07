import { Suspense } from "react";

import { client } from "../../lib/api";

async function Outcome() {
  const outcome = await client.rename({ name: "Mallory" }).then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  );
  return <pre id="outcome">{outcome}</pre>;
}

/* A page that writes while it renders: what a link on another site sets off. */
export default function Attack() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Outcome />
    </Suspense>
  );
}
