/**
 * What the realtime hooks and the optimistic helper look like to a
 * component, as the docs show them.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createQueryCaller } from "../src/create-query-caller";
import { optimisticOptions } from "../src/optimistic";

const { endpoint, stream, channel } = courier();

type User = { id: number; name: string };
type NewUser = { name: string };

const api = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        list: endpoint.get("").response<User[]>(),
        create: endpoint.post("").variables<NewUser>().response<User>(),
        changes: stream.get("changes").response<User>(),
        room: channel.connect("room").send<{ text: string }>().response<{ text: string }>(),
      },
    }),
  },
});

describe("the realtime hooks", () => {
  const q = createQueryCaller(api);

  it("take a window of events and answer from send whether the message was kept", () => {
    function used(): void {
      const { events } = q.users.useSubscription("changes", { maxEvents: 10 });
      expectTypeOf(events[0]?.data).toEqualTypeOf<User | undefined>();

      const { send } = q.users.useChannel("room");
      expectTypeOf(send({ text: "hello" })).toEqualTypeOf<boolean>();
    }

    expect(used).toBeTypeOf("function");
  });
});

describe("optimisticOptions", () => {
  const q = createQueryCaller(api);

  it("spreads into a mutation whose variables it names", () => {
    function used(queryClient: Parameters<typeof optimisticOptions>[0]): void {
      q.users.useMutation("create", {
        ...optimisticOptions<User[], NewUser>(queryClient, {
          queryKey: ["api", "users", "list"],
          updater: (users, user) => [...(users ?? []), { id: -1, ...user }],
        }),
      });
    }

    expect(used).toBeTypeOf("function");
  });
});
