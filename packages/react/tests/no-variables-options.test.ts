import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { QueryClient } from "@tanstack/react-query";
import { createQueryCaller } from "../src/create-query-caller";

const UserSchema = z.object({ id: z.string() });
const EventSchema = z.object({ n: z.number() });
const ById = z.object({ id: z.string() });

const { endpoint, channel, stream } = courier();

const api = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        getAll: endpoint.get("").response(z.array(UserSchema)),
        getById: endpoint.get(":id").variables(ById).response(UserSchema),
        purge: endpoint.del("").response(UserSchema),
        feed: stream.get("feed").response(EventSchema),
        room: channel.connect("room").response(EventSchema),
      },
    }),
  },
});

/**
 * An endpoint that never named its variables carries `void`, not `undefined`.
 * Every option object that decides whether `variables` is required has to admit
 * it, or passing any unrelated option to such an endpoint stops compiling.
 */
describe("options for an endpoint that takes no variables", () => {
  const q = createQueryCaller(api);
  const queryClient = new QueryClient();

  it("accepts an option object with no variables field", () => {
    function used(): void {
      q.users.useQuery("getAll", { staleTime: 1000 });
      q.users.useSuspenseQuery("getAll", { staleTime: 1000 });
      q.users.useInfiniteQuery("getAll", {
        initialPageParam: 0,
        getNextPageParam: () => undefined,
      });
      void q.users.prefetchQuery(queryClient, "getAll", { staleTime: 1000 });
      q.users.useSubscription("feed", { enabled: false });
      q.users.useChannel("room", { enabled: false });
      q.users.useMutation("purge", { invalidate: [] });
    }

    expect(used).toBeTypeOf("function");
  });

  it("still requires variables where the endpoint declares them", () => {
    function used(): void {
      q.users.useQuery("getById", { variables: { id: "1" } });
      // @ts-expect-error — getById declares variables
      q.users.useQuery("getById", { staleTime: 1000 });
      // @ts-expect-error — getById declares variables
      void q.users.prefetchQuery(queryClient, "getById", { staleTime: 1000 });
    }

    expect(used).toBeTypeOf("function");
  });
});
