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
const Order = z.object({ id: z.number(), userId: z.string(), total: z.number() });

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    orders: defineGroup({
      prefix: "/orders",
      endpoints: {
        list: endpoint.get("").response(z.array(Order)),
        create: endpoint.post("").variables<{ note: string }>().response(Order),
      },
    }),
  },
});

type Event = Extract<ChildMessage, { type: "event" }>;

const ended = (m: ChildMessage): m is Event =>
  m.type === "event" && m.event.type === "mock:request:end";
const started = (m: ChildMessage): m is Event =>
  m.type === "event" && m.event.type === "mock:request:start";

let worker: DrivenWorker;
let url: string;

beforeEach(async () => {
  worker = driveWorker(defineMockServer({ source: api, log: "silent", seed: { count: 3000 } }));
  url = await startWorker(worker);
});

afterEach(async () => {
  await stopWorker(worker);
  vi.restoreAllMocks();
});

describe("the bodies of a managed mock's requests", () => {
  it("are carried as a part, with the whole's size, once too large for an event", async () => {
    const answer = await fetch(`${url}/orders`).then((res) => res.text());

    const { event } = await worker.next(ended);

    expect(event.dataCutFrom).toBe(Buffer.byteLength(answer));
    const part = event.data as unknown[];
    expect(part.length).toBeLessThan(3000);
    expect(part.at(-1)).toMatch(/^… [\d,]+ more items$/);
    expect(JSON.stringify(event).length).toBeLessThan(20 * 1024);
  });

  it("are sent whole when a page asks for one the event carried a part of", async () => {
    const answer = await fetch(`${url}/orders`).then((res) => res.text());
    const { event } = await worker.next(ended);

    const reply = await worker.command({
      action: "mock:request:body",
      requestId: event.requestId,
      part: "response",
    });

    expect(reply).toMatchObject({ ok: true });
    expect(JSON.parse(String(reply.data))).toEqual(JSON.parse(answer));
  });

  it("keep the whole of a request body too large for its event", async () => {
    const note = "n".repeat(40_000);
    await fetch(`${url}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const { event } = await worker.next(started);

    const reply = await worker.command({
      action: "mock:request:body",
      requestId: event.requestId,
      part: "request",
    });

    expect(event.variablesCutFrom).toBeGreaterThan(40_000);
    expect(JSON.parse(String(reply.data))).toMatchObject({ note });
  });

  it("are said to be gone for a request whose body was carried whole, or is not known", async () => {
    await fetch(`${url}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "short" }),
    });
    const { event } = await worker.next(started);

    const kept = await worker.command({
      action: "mock:request:body",
      requestId: event.requestId,
      part: "request",
    });
    const unknown = await worker.command({
      action: "mock:request:body",
      requestId: "req_none",
      part: "response",
    });
    const malformed = await worker.command({
      action: "mock:request:body",
      requestId: "req_none",
      part: "both",
    });

    expect(kept).toMatchObject({ ok: false, error: expect.stringContaining("no longer keeps") });
    expect(unknown).toMatchObject({ ok: false });
    expect(malformed).toMatchObject({ ok: false, error: expect.stringContaining('"part"') });
  });
});
