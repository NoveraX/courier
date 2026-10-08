/**
 * @vitest-environment node
 *
 * What a managed mock tells Studio of its network once a command changed
 * it. The page reads a number or a range, so a latency given by name goes
 * out as the range it stands for: sent as the name, a mock slowed to 3G
 * would show as one with no latency.
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
      endpoints: {
        list: endpoint.get("").response(z.array(z.object({ id: z.number() }))),
      },
    }),
  },
});

let worker: DrivenWorker;
let url: string;

beforeEach(async () => {
  worker = driveWorker(defineMockServer({ source: api, log: "silent" }));
  url = await startWorker(worker);
});

afterEach(async () => {
  await stopWorker(worker);
  vi.restoreAllMocks();
});

function lastNetworkConfig(sent: ChildMessage[]): unknown {
  const configs = sent.flatMap((message) =>
    message.type === "event" && message.event.type === "mock:network:config"
      ? [message.event.config]
      : [],
  );
  return configs.at(-1);
}

describe("a managed mock whose network a command changed", () => {
  it("sends a latency given by name as the range it stands for", async () => {
    const result = await worker.command({
      action: "mock:network:set",
      config: { latency: "3g" },
      preset: "3g",
    });

    expect(result.ok).toBe(true);
    expect(lastNetworkConfig(worker.sent)).toMatchObject({
      latency: { min: 300, max: 900, jitter: 150 },
      latencyPreset: "3g",
    });
  });

  it("sends a latency given as a range as it was given", async () => {
    await worker.command({
      action: "mock:network:set",
      config: { latency: { min: 40, max: 60 } },
    });

    expect(lastNetworkConfig(worker.sent)).toMatchObject({ latency: { min: 40, max: 60 } });
  });
});

type WorkerEvent = Extract<ChildMessage, { type: "event" }>;

function isHalt(message: ChildMessage): message is WorkerEvent {
  return message.type === "event" && message.event.eventType === "auto-halted";
}

describe("a managed mock whose run a stop condition halts", () => {
  it("tells Studio why the run ended, then the settings left: none simulated, the limits kept", async () => {
    await worker.command({
      action: "mock:chaos:set",
      preset: "down",
      config: {
        errorRate: 1,
        faultWeights: [{ type: "500", weight: 100 }],
        stopConditions: {
          enabled: true,
          errorRateThreshold: 50,
          errorRateDurationSecs: 30,
          p99Threshold: 0,
          p99DurationSecs: 60,
          maxDurationMins: 0,
        },
      },
    });

    for (let i = 0; i < 5; i++) await fetch(`${url}/users`);
    const halt = await worker.next(isHalt);

    expect(halt.event).toMatchObject({ mode: "chaos", reason: "error rate 100% > 50%" });
    const configs = worker.sent.flatMap((m) =>
      m.type === "event" && m.event.type === "mock:network:config" ? [m.event.config] : [],
    );
    expect(configs.at(-2)).toEqual({ autoHalted: true, haltReason: "error rate 100% > 50%" });
    expect(configs.at(-1)).toMatchObject({
      errorRate: 0,
      faultWeights: [],
      chaosPreset: "none",
      stopConditions: { enabled: true, errorRateThreshold: 50 },
    });
    expect((await fetch(`${url}/users`)).status).toBe(200);
  });
});

const STOP = {
  enabled: true,
  errorRateThreshold: 50,
  errorRateDurationSecs: 30,
  p99Threshold: 0,
  p99DurationSecs: 60,
  maxDurationMins: 0,
};

describe("a managed mock's route overrides", () => {
  it("changes the one route a command names, and leaves the others as they were", async () => {
    await worker.command({
      action: "mock:network:set",
      config: {
        routeOverrides: [
          { routeId: "users:list", enabled: true, errorRate: 1 },
          { routeId: "orders:create", enabled: true, latency: { min: 300, max: 300 } },
        ],
      },
    });

    await worker.command({
      action: "mock:network:set",
      config: { routeOverride: { routeId: "users:list", enabled: false, errorRate: 1 } },
    });

    expect(lastNetworkConfig(worker.sent)).toMatchObject({
      routeOverrides: [
        { routeId: "users:list", enabled: false, errorRate: 1 },
        { routeId: "orders:create", enabled: true, latency: { min: 300, max: 300 } },
      ],
    });
    expect((await fetch(`${url}/users`)).status).toBe(200);
  });

  it("keeps an override switched off with its settings, and drops one that sets nothing", async () => {
    await worker.command({
      action: "mock:network:set",
      config: { routeOverride: { routeId: "users:list", enabled: true, errorRate: 0.5 } },
    });
    await worker.command({
      action: "mock:network:set",
      config: { routeOverride: { routeId: "users:list", enabled: false } },
    });

    expect(lastNetworkConfig(worker.sent)).toMatchObject({ routeOverrides: [] });
  });

  it("keeps a route that never fails answering while the mock is down", async () => {
    await worker.command({
      action: "mock:network:set",
      config: { routeOverride: { routeId: "users:list", enabled: true, errorRate: 0 } },
    });
    await worker.command({
      action: "mock:chaos:set",
      preset: "down",
      config: { errorRate: 1, faultWeights: [{ type: "503", weight: 100 }] },
    });

    expect((await fetch(`${url}/users`)).status).toBe(200);
    expect((await fetch(`${url}/users/unknown`)).status).not.toBe(200);
  });

  it("switches them off through a halt, each keeping its settings, so they can be switched back on", async () => {
    await worker.command({
      action: "mock:network:set",
      config: { routeOverride: { routeId: "users:list", enabled: true, errorRate: 1 } },
    });
    await worker.command({
      action: "mock:chaos:set",
      preset: "down",
      config: { errorRate: 1, faultWeights: [{ type: "500", weight: 100 }], stopConditions: STOP },
    });

    for (let i = 0; i < 5; i++) await fetch(`${url}/users`);
    await worker.next(isHalt);

    expect(lastNetworkConfig(worker.sent)).toMatchObject({
      errorRate: 0,
      routeOverrides: [{ routeId: "users:list", enabled: false, errorRate: 1 }],
      stopConditions: { enabled: true, errorRateThreshold: 50 },
    });
    expect((await fetch(`${url}/users`)).status).toBe(200);
  });
});
