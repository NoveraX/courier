import { useLoaderData } from "@remix-run/react";

import { accounts, outcome } from "../accounts.server";

export async function loader() {
  return { written: await outcome(accounts.login({ user: "mallory" })) };
}

export default function AttackLogin() {
  return <pre id="outcome">{useLoaderData<typeof loader>().written}</pre>;
}
