import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createQueryCaller } from "../src/create-query-caller";

const UserSchema = z.object({ id: z.string() });
const EventSchema = z.object({ n: z.number() });
const Incoming = z.object({ text: z.string() });

const { endpoint, channel, stream } = courier();

const api = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        getAll: endpoint.get("").response(z.array(UserSchema)),
        create: endpoint.post("").variables(UserSchema).response(UserSchema),
        feed: stream.get("feed").response(EventSchema),
        room: channel.connect("room").send(Incoming).response(EventSchema),
      },
    }),
  },
});

/**
 * A hook serves one kind of endpoint. The head an endpoint was built from says
 * which, so naming the wrong endpoint is a compile error rather than something
 * that fails when the component renders.
 */
describe("a hook offers only the endpoints it can serve", () => {
  const q = createQueryCaller(api);
  const queryClient = new QueryClient();

  it("accepts the endpoint each hook was written for", () => {
    function useTyped(): void {
      q.users.useQuery("getAll");
      q.users.useSuspenseQuery("getAll");
      q.users.useInfiniteQuery("getAll", {
        initialPageParam: 0,
        getNextPageParam: () => undefined,
      });
      void q.users.prefetchQuery(queryClient, "getAll");
      q.users.useMutation("create");
      q.users.useSubscription("feed");
      q.users.useChannel("room");
    }

    expect(useTyped).toBeTypeOf("function");
  });

  it("refuses an endpoint built from another head", () => {
    function useRefused(): void {
      // @ts-expect-error — create is a mutation
      q.users.useQuery("create");
      // @ts-expect-error — getAll is a query
      q.users.useMutation("getAll");
      // @ts-expect-error — feed is a stream, and has no promise to await
      q.users.useQuery("feed");
      // @ts-expect-error — room is a channel
      q.users.useSuspenseQuery("room");
      // @ts-expect-error — getAll is not a stream
      q.users.useSubscription("getAll");
      // @ts-expect-error — feed is a stream, not a channel
      q.users.useChannel("feed");
      // @ts-expect-error — create is a mutation
      void q.users.prefetchQuery(queryClient, "create");
    }

    expect(useRefused).toBeTypeOf("function");
  });
});
