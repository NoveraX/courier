/**
 * @vitest-environment jsdom
 */

import type { ServerResponse } from "node:http";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createQueryCaller } from "../src/create-query-caller";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint, stream } = courier();

type User = { id: string; name: string };

let server: TestServer;
let queryClient: QueryClient;
/* When set, the stream sends its events only once the list's answer has rendered. */
let listAnswered: Promise<void> | undefined;
/* Otherwise the list is answered only once the stream has sent its events. */
let changesSent: Promise<void>;
let sentChanges: () => void = () => {};

/* The list and the stream come over real sockets, which on a busy machine
   takes longer than the one second waitFor waits by default. */
const SOCKETS = { timeout: 3000 };

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function sendChanges(res: ServerResponse) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  res.write(": open\n\n");
  const events = [1, 2].map(
    (n) => `id: ${n}\ndata: ${JSON.stringify({ id: `c${n}`, name: `Changed ${n}` })}\n\n`,
  );
  if (!listAnswered) {
    /* Both in one write, so the list cannot come between them. */
    res.write(events.join(""), () => sentChanges());
    return;
  }
  const timers: ReturnType<typeof setTimeout>[] = [];
  void listAnswered.then(() => {
    for (const [at, event] of events.entries()) {
      timers.push(setTimeout(() => res.write(event), (at + 1) * 100));
    }
  });
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
  listAnswered = undefined;
  changesSent = new Promise((resolve) => {
    sentChanges = resolve;
  });
  server = await startTestServer((_req, res, url) => {
    if (url.pathname === "/users/changes") return sendChanges(res);
    const answer = () => sendJson(res, [{ id: "1", name: "Alice" }]);
    /* Waiting for the events rather than a fixed time: on a busy machine the
       stream can open after any delay chosen here. Then a moment for the
       client to take them in before the list. */
    if (listAnswered) answer();
    else void changesSent.then(() => setTimeout(answer, 100));
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

    await waitFor(
      () =>
        expect(result.current.data?.map((u) => u.name)).toEqual([
          "Alice",
          "Changed 1",
          "Changed 2",
        ]),
      SOCKETS,
    );
    expect(seen.filter((entry) => entry.startsWith("success")).at(0)).toBe(
      "success:Alice,Changed 1,Changed 2",
    );
  });

  it("merges events that arrive after the first fetch straight away", async () => {
    let rendered: () => void = () => {};
    /* Once the list has rendered, not once it is sent: a client still taking the list in
       would hold the first event and fold it into the first answer. */
    listAnswered = new Promise((resolve) => {
      rendered = resolve;
    });
    const q = makeCaller();
    const seen: string[] = [];
    const { result } = renderHook(
      () => {
        const query = q.users.useComputedQuery("list", {
          subscriptionMethod: "changes",
          mapper: (current, event) => [...(current ?? []), event.data],
        });
        seen.push(`${query.status}:${(query.data ?? []).map((u) => u.name).join(",")}`);
        if (query.status === "success") rendered();
        return query;
      },
      { wrapper },
    );

    /* The list first, alone, then the events on top of it. Each render is
       logged, not caught by polling, which a busy machine can miss. */
    await waitFor(
      () =>
        expect(result.current.data?.map((u) => u.name)).toEqual([
          "Alice",
          "Changed 1",
          "Changed 2",
        ]),
      SOCKETS,
    );
    expect(seen.filter((entry) => entry.startsWith("success")).at(0)).toBe("success:Alice");
  });
});
