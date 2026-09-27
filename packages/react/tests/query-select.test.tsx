/**
 * @vitest-environment jsdom
 */

import { createElement, type ReactNode, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { createQueryCaller } from "../src/create-query-caller";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();

type User = { id: string; name: string };

let server: TestServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(Suspense, { fallback: null }, children),
  );
}

function makeCaller() {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      list: endpoint.get("").response<User[]>(),
      byId: endpoint.get(":id").variables<{ id: string }>().response<User>(),
    },
  });
  return createQueryCaller(defineApi({ name: "api", baseURL: server.origin, groups: { users } }));
}

beforeEach(async () => {
  server = await startTestServer((_req, res, url) =>
    url.pathname === "/users"
      ? sendJson(res, [
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
        ])
      : sendJson(res, { id: "1", name: "Alice" }),
  );
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("select", () => {
  it("gives useQuery the type and value it returns", async () => {
    const q = makeCaller();
    const { result } = renderHook(
      () => q.users.useQuery("list", { select: (users) => users.length }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBe(2));
    expectTypeOf(result.current.data).toEqualTypeOf<number | undefined>();
  });

  it("gives useSuspenseQuery the type and value it returns", async () => {
    const q = makeCaller();
    const { result } = renderHook(
      () =>
        q.users.useSuspenseQuery("byId", {
          variables: { id: "1" },
          select: (user) => user.name,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBe("Alice"));
    expectTypeOf(result.current.data).toEqualTypeOf<string>();
  });

  it("leaves the endpoint's own type in place without it", () => {
    const q = makeCaller();
    function used(): void {
      const { data } = q.users.useQuery("list");
      expectTypeOf(data).toEqualTypeOf<User[] | undefined>();
    }

    expect(used).toBeTypeOf("function");
  });
});
