import { Suspense } from "react";

import { client } from "../../lib/api";

async function Encoded() {
  const first = await client.b64();
  const second = await client.me();
  return <pre id="b64">{JSON.stringify({ first, second })}</pre>;
}

/* The API sets a cookie whose value Next.js would change on the way. */
export default function B64() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Encoded />
    </Suspense>
  );
}
