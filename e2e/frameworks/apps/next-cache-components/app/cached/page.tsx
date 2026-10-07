import { catalog } from "../../lib/catalog";

async function products(): Promise<unknown> {
  "use cache";
  return catalog.products();
}

/* A cached function calling an endpoint that takes no session: built ahead of time. */
export default async function Cached() {
  return <pre id="cached">{JSON.stringify(await products())}</pre>;
}
