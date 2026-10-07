import { useLoaderData } from "react-router";

import { accounts } from "../accounts.server";

export async function loader() {
  const first = await accounts.me();
  const second = await accounts.me();
  return { first, second };
}

export default function Renew() {
  return <pre id="renew">{JSON.stringify(useLoaderData<typeof loader>())}</pre>;
}
