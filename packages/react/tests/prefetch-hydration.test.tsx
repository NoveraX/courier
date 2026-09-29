/**
 * @vitest-environment jsdom
 */

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { hydrate } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { createQueryCaller } from "../src/create-query-caller";
import { dehydrate, QueryClient, QueryClientProvider } from "../src/index";
import { createQueryKeys } from "../src/keys";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();

type User = { id: string; name: string };

let server: TestServer;

function usersGroup() {
  return defineGroup({ prefix: "users", endpoints: { list: endpoint.get("").response<User[]>() } });
}

beforeEach(async () => {
  server = await startTestServer((_req, res) => sendJson(res, [{ id: "1", name: "Alice" }]));
});

afterEach(() => server.close());

/**
 * The documented server prefetch: a direct caller on the server, a proxy
 * caller in the browser, one cache between them.
 */
describe("prefetching for a proxy caller", () => {
  it("hydrates the proxy caller's query when the API is named after its source", async () => {
    const api = defineApi({ name: "api", baseURL: server.origin, groups: { users: usersGroup() } });
    const serverClient = new QueryClient();
    await createQueryCaller(api).users.prefetchQuery(serverClient, "list");
    const browserClient = new QueryClient();
    hydrate(browserClient, dehydrate(serverClient));
    const q = createProxyQueryCaller<typeof api>("api");

    const { result } = renderHook(
      () => q.users.useQuery("list", { staleTime: Number.POSITIVE_INFINITY }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client: browserClient }, children),
      },
    );

    expect(result.current.data).toEqual([{ id: "1", name: "Alice" }]);
    expect(server.requests).toHaveLength(1);
  });

  it("keys an unnamed API by the first label of its host", () => {
    const api = defineApi({ baseURL: server.origin, groups: { users: usersGroup() } });

    expect(createQueryKeys(api)("users", "list")).toEqual(["127", "users", "list"]);
  });
});
