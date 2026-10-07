import { client } from "$lib/server/api";

export async function load() {
  const first = await client.me();
  const second = await client.me();
  return { renew: { first, second } };
}
