import { withRequestContext } from "@noverax/courier-next/pages";
import type { GetServerSidePropsContext } from "next";

import { client, type Seen } from "../lib/api";

export const getServerSideProps = withRequestContext(
  async (_context: GetServerSidePropsContext) => ({
    props: { me: await client.me() },
  }),
);

export default function Legacy({ me }: { me: Seen }) {
  return <pre id="legacy">{JSON.stringify(me)}</pre>;
}
