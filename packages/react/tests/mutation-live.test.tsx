/**
 * @vitest-environment jsdom
 */

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { createQueryCaller } from "../src/create-query-caller";
import { createQueryKeys } from "../src/keys";
import { optimisticOptions } from "../src/optimistic";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();

type User = { id: string; name: string };

let server: TestServer;
let queryClient: QueryClient;
let users: User[];
let listDelay: number;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeApi() {
  const group = defineGroup({
    prefix: "users",
    endpoints: {
      list: endpoint.get("").response<User[]>(),
      create: endpoint.post("").variables<{ name: string; fail?: boolean }>().response<User>(),
    },
  });
  return defineApi({ name: "api", baseURL: server.origin, groups: { users: group } });
}

function listRequests(): number {
  return server.requests.filter((r) => r.method === "GET").length;
}

beforeEach(async () => {
  users = [{ id: "1", name: "Alice" }];
  listDelay = 0;
  server = await startTestServer(async (req, res) => {
    if (req.method === "GET") {
      setTimeout(() => sendJson(res, users), listDelay);
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { name: string; fail?: boolean };
    if (body.fail) return sendJson(res, { message: "refused" }, 500);
    const user = { id: String(users.length + 1), name: body.name };
    users = [...users, user];
    sendJson(res, user);
  });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("useMutation's invalidate", () => {
  it("refetches the named queries after a success only", async () => {
    const api = makeApi();
    const q = createQueryCaller(api);
    const keys = createQueryKeys(api);
    renderHook(() => q.users.useQuery("list"), { wrapper });
    await waitFor(() => expect(listRequests()).toBe(1));
    const { result } = renderHook(
      () => q.users.useMutation("create", { invalidate: [keys("users", "list")] }),
      { wrapper },
    );

    await act(() => result.current.mutateAsync({ name: "Zed", fail: true }).catch(() => undefined));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listRequests()).toBe(1);

    await act(() => result.current.mutateAsync({ name: "Eve" }));
    expect(listRequests()).toBe(2);
  });

  it("keeps the mutation pending until the refetch has finished", async () => {
    const api = makeApi();
    const q = createQueryCaller(api);
    const keys = createQueryKeys(api);
    const list = renderHook(() => q.users.useQuery("list"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));
    listDelay = 200;
    const { result } = renderHook(
      () => q.users.useMutation("create", { invalidate: [keys("users", "list")] }),
      { wrapper },
    );

    await act(() => result.current.mutateAsync({ name: "Eve" }));

    expect(queryClient.getQueryData(keys("users", "list"))).toHaveLength(2);
  });
});

describe("useMutation's onSettled", () => {
  it("keeps the mutation pending until the promise it returns settles", async () => {
    const api = makeApi();
    const q = createQueryCaller(api);
    const keys = createQueryKeys(api);
    const list = renderHook(() => q.users.useQuery("list"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));
    listDelay = 200;
    const { result } = renderHook(
      () =>
        q.users.useMutation("create", {
          onSettled: () => queryClient.invalidateQueries({ queryKey: keys("users", "list") }),
        }),
      { wrapper },
    );

    await act(() => result.current.mutateAsync({ name: "Eve" }));

    expect(queryClient.getQueryData(keys("users", "list"))).toHaveLength(2);
  });
});

describe("optimisticOptions", () => {
  it("leaves no optimistic entry behind when a mutation on an empty cache fails", async () => {
    const api = makeApi();
    const q = createQueryCaller(api);
    const key = createQueryKeys(api)("users", "list");
    const { result } = renderHook(
      () =>
        q.users.useMutation("create", {
          ...optimisticOptions(queryClient, {
            queryKey: key,
            updater: (current: User[] | undefined, vars: { name: string }) => [
              ...(current ?? []),
              { id: "temp", name: vars.name },
            ],
          }),
        }),
      { wrapper },
    );

    await act(() => result.current.mutateAsync({ name: "Eve", fail: true }).catch(() => undefined));

    expect(queryClient.getQueryData(key)).toBeUndefined();
    const list = renderHook(() => q.users.useQuery("list"), { wrapper });
    expect(list.result.current.data).toBeUndefined();
    await waitFor(() => expect(list.result.current.data).toEqual([{ id: "1", name: "Alice" }]));
  });

  it("keeps the mutation pending until the refetch it starts has finished", async () => {
    const api = makeApi();
    const q = createQueryCaller(api);
    const key = createQueryKeys(api)("users", "list");
    const list = renderHook(() => q.users.useQuery("list"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));
    listDelay = 200;
    const { result } = renderHook(
      () =>
        q.users.useMutation("create", {
          ...optimisticOptions(queryClient, {
            queryKey: key,
            updater: (current: User[] | undefined, vars: { name: string }) => [
              ...(current ?? []),
              { id: "temp", name: vars.name },
            ],
          }),
        }),
      { wrapper },
    );

    await act(() => result.current.mutateAsync({ name: "Eve" }));

    expect(queryClient.getQueryData(key)).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Eve" },
    ]);
  });
});

describe("useMutation's onMutate result", () => {
  it("reaches onError typed as onMutate returned it, so a failure rolls back", async () => {
    const api = makeApi();
    const q = createQueryCaller(api);
    const keys = createQueryKeys(api);
    const key = keys("users", "list");
    const list = renderHook(() => q.users.useQuery("list"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));
    const { result } = renderHook(
      () =>
        q.users.useMutation("create", {
          onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<User[]>(key);
            queryClient.setQueryData<User[]>(key, (old) => [
              ...(old ?? []),
              { id: "temp", name: variables.name },
            ]);
            return { previous };
          },
          onError: (_error, _variables, snapshot) => {
            expectTypeOf(snapshot).toEqualTypeOf<{ previous: User[] | undefined } | undefined>();
            if (snapshot?.previous) queryClient.setQueryData(key, snapshot.previous);
          },
        }),
      { wrapper },
    );

    await act(() => result.current.mutateAsync({ name: "Zed", fail: true }).catch(() => undefined));

    expect(queryClient.getQueryData(key)).toEqual([{ id: "1", name: "Alice" }]);
  });
});
