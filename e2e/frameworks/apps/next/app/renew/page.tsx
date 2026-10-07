import { Suspense } from "react";

import { client } from "../../lib/api";

async function Twice() {
  const first = await client.me();
  const second = await client.me();
  return <pre id="renew">{JSON.stringify({ first, second })}</pre>;
}

export default function Renew() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Twice />
    </Suspense>
  );
}
