/**
 * @vitest-environment node
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineMockServer } from "../../src/managed/define-mock-server";
import type { ChildMessage } from "../../src/managed/types";
import type { DrivenWorker } from "./drive-worker";
import { driveWorker, startWorker, stopWorker } from "./drive-worker";

const { endpoint } = courier();
const User = z.object({ id: z.number(), name: z.string() });

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        list: endpoint.get("").response(z.array(User)),
        create: endpoint.post("").variables<{ name: string }>().response(User),
      },
    }),
  },
});

type Event = Extract<ChildMessage, { type: "event" }>;

const isReport = (m: ChildMessage): m is Event =>
  m.type === "event" && m.event.type === "mock:store:changes";

let worker: DrivenWorker;
let url: string;

beforeEach(async () => {
  worker = driveWorker(defineMockServer({ source: api, log: "silent", seed: { count: 5000 } }));
  url = await startWorker(worker);
});

afterEach(async () => {
  await stopWorker(worker);
  vi.restoreAllMocks();
});

function reports(): Array<Record<string, unknown>> {
  return worker.sent.filter(isReport).map((m) => m.event);
}

describe("store reports of a managed mock", () => {
  it("starts Studio with the store whole", () => {
    const ready = worker.sent.find((m) => m.type === "ready");

    expect(ready?.type === "ready" && ready.collections[0]?.count).toBe(5000);
  });

  it("sends a record a request adds, not the collection it joins", async () => {
    await fetch(`${url}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    });

    const { event } = await worker.next(isReport);

    expect(event).toMatchObject({ seq: 1, whole: false, removed: [] });
    expect(event.collections).toEqual([
      {
        name: "users",
        count: 5001,
        edits: { removed: [], changed: [], added: [expect.objectContaining({ name: "Ada" })] },
      },
    ]);
  });

  it("reports a change a command makes before the next message", async () => {
    await worker.command({
      action: "mock:store:update",
      collection: "users",
      id: 1,
      data: { name: "Grace" },
    });

    expect(reports()).toEqual([
      {
        type: "mock:store:changes",
        seq: 1,
        whole: false,
        collections: [
          {
            name: "users",
            count: 5000,
            edits: {
              removed: [],
              changed: [{ index: 0, record: expect.objectContaining({ id: 1, name: "Grace" }) }],
              added: [],
            },
          },
        ],
        removed: [],
      },
    ]);
  });

  it("resends the store whole when asked", async () => {
    const result = await worker.command({ action: "mock:store:resend" });

    expect(result.ok).toBe(true);
    expect(reports()).toEqual([
      expect.objectContaining({
        seq: 1,
        whole: true,
        collections: [expect.objectContaining({ name: "users", count: 5000 })],
      }),
    ]);
  });
});
