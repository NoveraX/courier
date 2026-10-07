import { useLoaderData } from "react-router";

import { accounts, outcome } from "../accounts.server";

export async function loader() {
  return { written: await outcome(accounts.rename({ name: "Mallory" })) };
}

export default function Attack() {
  return <pre id="outcome">{useLoaderData<typeof loader>().written}</pre>;
}
