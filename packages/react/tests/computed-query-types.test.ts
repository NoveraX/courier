import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createQueryCaller } from "../src/create-query-caller";

const { endpoint, stream } = courier();

type User = { id: string; name: string };
type Change = { kind: "added" | "removed"; user: User };

const api = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        list: endpoint.get("").response<User[]>(),
        changes: stream.get("changes").response<Change>(),
      },
    }),
  },
});

/**
 * `useComputedQuery` merges one of the group's streams into a query, so the
 * stream is named from the group's streams and its events carry that
 * stream's type, as `useSubscription` gives them.
 */
describe("useComputedQuery options", () => {
  const q = createQueryCaller(api);

  it("types each event as the named stream sends it", () => {
    function useTyped(): void {
      q.users.useComputedQuery("list", {
        subscriptionMethod: "changes",
        mapper: (current, event) => {
          expectTypeOf(event.data).toEqualTypeOf<Change>();
          return [...(current ?? []), event.data.user];
        },
      });
    }

    expect(useTyped).toBeTypeOf("function");
  });

  it("refuses a name that is not one of the group's streams", () => {
    function useRefused(): void {
      q.users.useComputedQuery("list", {
        // @ts-expect-error — no such stream
        subscriptionMethod: "definitely-not-a-stream",
        mapper: (current) => current ?? [],
      });
      q.users.useComputedQuery("list", {
        // @ts-expect-error — list is a query, not a stream
        subscriptionMethod: "list",
        mapper: (current) => current ?? [],
      });
    }

    expect(useRefused).toBeTypeOf("function");
  });
});

/**
 * A stream that fails does not fail the query, so the query's result cannot
 * say it did: the options name what hears of it.
 */
describe("useComputedQuery stream callbacks", () => {
  const q = createQueryCaller(api);

  it("hear the stream's failure as an Error and its status as a ConnectionStatus", () => {
    function useTyped(): void {
      q.users.useComputedQuery("list", {
        subscriptionMethod: "changes",
        mapper: (current) => current ?? [],
        onStreamError: (error) => expectTypeOf(error).toEqualTypeOf<Error>(),
        onStreamStatusChange: (status) =>
          expectTypeOf(status).toEqualTypeOf<
            "disconnected" | "connecting" | "connected" | "reconnecting"
          >(),
      });
    }

    expect(useTyped).toBeTypeOf("function");
  });
});
