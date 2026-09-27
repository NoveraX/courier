/**
 * @vitest-environment jsdom
 */

import type { ServerResponse } from "node:http";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { createQueryCaller } from "../src/create-query-caller";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint, stream } = courier();

type User = { id: string; name: string };

let server: TestServer;
let queryClient: QueryClient;
let listDelay: number;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function sendChanges(res: ServerResponse) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  res.write(": open\n\n");
  const timers = [1, 2].map((n) =>
    setTimeout(() => res.write(`id: ${n}\ndata: ${JSON.stringify({ id: `c${n}`, name: `Changed ${n}` })}\n\n`), n * 50),
  );
  res.on("close", () => {
    for (const timer of timers) clearTimeout(timer);
  });
}

function makeCaller() {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      list: endpoint.get("").response<User[]>(),
      changes: stream.get("changes").response<User>(),
    },
  });
  return createQueryCaller(defineApi({ name: "api", baseURL: server.origin, groups: { users } }));
}

beforeEach(async () => {
  listDelay = 300;
  server = await startTestServer((_req, res, url) => {
    if (url.pathname === "/users/changes") return sendChanges(res);
    setTimeout(() => sendJson(res, [{ id: "1", name: "Alice" }]), listDelay);
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("useComputedQuery against a real list and stream", () => {
  it("merges events that arrive before the first fetch once it resolves", async () => {
    const q = makeCaller();
    const seen: string[] = [];
    const { result } = renderHook(
      () => {
        const query = q.users.useComputedQuery("list", {
          subscriptionMethod: "changes",
          mapper: (current, event) => [...(current ?? []), event.data],
        });
        seen.push(`${query.status}:${(query.data ?? []).map((u) => u.name).join(",")}`);
        return query;
      },
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.data?.map((u) => u.name)).toEqual(["Alice", "Changed 1", "Changed 2"]),
    );
    expect(seen.filter((entry) => entry.startsWith("success")).at(0)).toBe(
      "success:Alice,Changed 1,Changed 2",
    );
  });

  it("merges events that arrive after the first fetch straight away", async () => {
    listDelay = 0;
    const q = makeCaller();
    const { result } = renderHook(
      () =>
        q.users.useComputedQuery("list", {
          subscriptionMethod: "changes",
          mapper: (current, event) => [...(current ?? []), event.data],
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.map((u) => u.name)).toEqual(["Alice"]));
    await waitFor(() =>
      expect(result.current.data?.map((u) => u.name)).toEqual(["Alice", "Changed 1", "Changed 2"]),
    );
  });
});
