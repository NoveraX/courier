/**
 * @vitest-environment node
 *
 * A slow upload to a managed mock is reported to Studio as it arrives —
 * `mock:request:upload` events with how much has come, before the request's
 * `mock:request:start` — all under one request id.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defineMockServer } from "../../src/managed/define-mock-server";
import type { ChildMessage } from "../../src/managed/types";
import type { DrivenWorker } from "./drive-worker";
import { driveWorker, startWorker, stopWorker } from "./drive-worker";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    files: defineGroup({
      prefix: "/files",
      endpoints: { create: endpoint.post("").variables<FormData>().response<{ id: number }>() },
    }),
  },
});

type Event = Extract<ChildMessage, { type: "event" }>;

const isRequestEvent = (m: ChildMessage): m is Event =>
  m.type === "event" && String(m.event.type).startsWith("mock:request:");
const ended = (m: ChildMessage): m is Event =>
  m.type === "event" && m.event.type === "mock:request:end";

let worker: DrivenWorker;
let url: string;

beforeEach(async () => {
  worker = driveWorker(
    defineMockServer({ source: api, log: "silent", network: { uploads: { bandwidth: 2048 } } }),
  );
  url = await startWorker(worker);
});

afterEach(async () => {
  await stopWorker(worker);
  vi.restoreAllMocks();
});

describe("a slow upload to a managed mock", () => {
  it("is reported as it arrives, then started and ended, under one id", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(256 * 1024)], "scan.pdf"));
    const size = (await new Response(form).blob()).size;

    await fetch(`${url}/files`, { method: "POST", body: form });
    await worker.next(ended);
    const events = worker.sent.filter(isRequestEvent).map((m) => m.event);

    const kinds = events.map((event) => event.type);
    const uploads = events.filter((event) => event.type === "mock:request:upload");
    expect(uploads.length).toBeGreaterThanOrEqual(2);
    expect(kinds.indexOf("mock:request:start")).toBeGreaterThan(
      kinds.lastIndexOf("mock:request:upload"),
    );
    expect(new Set(events.map((event) => event.requestId)).size).toBe(1);
    expect(uploads[0]).toMatchObject({
      httpMethod: "POST",
      path: "/files",
      group: "files",
      endpoint: "create",
      source: "auto",
      total: size,
    });
  });
});
