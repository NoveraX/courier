import { client } from "../lib/api";

/* What the API answers for the user the page is rendered for. */
export async function Me({ id }: { id: string }) {
  const me = await client.me();
  return <pre id={id}>{JSON.stringify(me)}</pre>;
}
