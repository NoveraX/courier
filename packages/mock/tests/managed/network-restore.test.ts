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
const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: { list: endpoint.get("").response(z.array(z.object({ id: z.number() }))) },
    }),
  },
});

let worker: DrivenWorker;
let url: string;

beforeEach(async () => {
  worker = driveWorker(defineMockServer({ source: api, log: "silent", seed: { count: 2 } }));
  url = await startWorker(worker);
});

afterEach(async () => {
  await stopWorker(worker);
  vi.restoreAllMocks();
});

function lastNetwork(): Record<string, unknown> | undefined {
  const events = worker.sent.flatMap((m: ChildMessage) =>
    m.type === "event" && m.event.type === "mock:network:config" ? [m.event.config] : [],
  );
  return events.at(-1) as Record<string, unknown> | undefined;
}

describe("restoring a mock's network conditions", () => {
  it("makes them the ones kept, whole, with their presets", async () => {
    const result = await worker.command({
      action: "mock:network:restore",
      config: { errorRate: 1, faultWeights: [{ type: "503", weight: 100 }] },
      latencyPreset: "none",
      chaosPreset: "down",
    });

    expect(result.ok).toBe(true);
    expect(lastNetwork()).toMatchObject({
      errorRate: 1,
      chaosPreset: "down",
      latencyPreset: "none",
    });
    expect((await fetch(`${url}/users`)).status).toBe(503);
  });

  it("clears every condition when the kept ones were none", async () => {
    await worker.command({ action: "mock:chaos:set", config: { errorRate: 1 }, preset: "down" });

    await worker.command({ action: "mock:network:restore", config: null, chaosPreset: "none" });

    expect(lastNetwork()).toMatchObject({ chaosPreset: "none" });
    expect((await fetch(`${url}/users`)).status).toBe(200);
  });
});
