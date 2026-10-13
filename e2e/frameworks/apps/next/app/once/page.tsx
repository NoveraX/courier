import type { Metadata } from "next";
import { Suspense } from "react";

import { client } from "../../lib/api";

/* The page's title and its body read the same user, one after another: the API is asked once a render. */
export async function generateMetadata(): Promise<Metadata> {
  const me = await client.me();
  return { title: me.sid === null ? "Signed out" : "Signed in" };
}

async function Reads() {
  const first = await client.me();
  const again = await client.me();
  return <pre id="once">{JSON.stringify({ first, again })}</pre>;
}

export default function Once() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Reads />
    </Suspense>
  );
}
