import type { ReactNode } from "react";

import { q } from "../client";
import { Card } from "./card";
import { messageOf, stateOf } from "./state-of";

/** A list read by a query hook, and a search sent as a QUERY with its terms in the body. */
export function UsersDemo(): ReactNode {
  const users = q.users.useQuery("list");
  const found = q.users.useQuery("search", { variables: { name: "a" } });
  const names = users.data
    ?.slice(0, 3)
    .map((user) => user.name)
    .join(", ");
  return (
    <>
      <Card
        title="useQuery"
        state={stateOf(users)}
        detail={users.data ? `${users.data.length} users — ${names}` : messageOf(users.error)}
      />
      <Card
        title="QUERY, terms in the body"
        state={stateOf(found)}
        detail={found.data ? `${found.data.length} users found` : messageOf(found.error)}
      />
    </>
  );
}
