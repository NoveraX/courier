/**
 * Builder decorators written before the response method, on an auto server.
 *
 * `delay`, `withHeaders`, `withStatus`, `withLatency` and `transitionTo`
 * edited the auto-CRUD handler itself when they came first: the response
 * method then pushed a copy without them, so `.delay(400).resolves(x)` did
 * not delay, and the auto-CRUD route kept the delay for good.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { createEnhancedMockBuilder } from "../src/builder/mock-builder";
import type { ResolvedHandler } from "../src/types";

const { endpoint } = courier();
const Todo = z.object({ id: z.number(), title: z.string() });

const api = defineApi({
  baseURL: "https://api.example",
  groups: {
    todos: defineGroup({
      prefix: "/todos",
      endpoints: {
        list: endpoint.get("").response(z.array(Todo)),
        create: endpoint.post("").response(Todo),
      },
    }),
  },
});

const running: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function serve(overrides: Parameters<typeof createAutoMockServer>[0]["overrides"]) {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 2 },
    overrides,
  });
  running.push(server);
  return { url: (await server.start()).url, server };
}

describe("decorators before the response method", () => {
  it("apply to the response they come before", async () => {
    const { url } = await serve((mock) => {
      mock("todos", "list").delay(150).withHeaders({ "X-Stub": "yes" }).resolves([{ id: 99, title: "stub" }]);
    });

    const started = performance.now();
    const response = await fetch(`${url}/todos`);
    const elapsed = performance.now() - started;

    expect(await response.json()).toEqual([{ id: 99, title: "stub" }]);
    expect(response.headers.get("x-stub")).toBe("yes");
    expect(elapsed).toBeGreaterThanOrEqual(140);
  });

  it("keep a status set before resolves", async () => {
    const { url } = await serve((mock) => {
      mock("todos", "create").withStatus(201).resolves({ id: 1, title: "made" });
    });

    const response = await fetch(`${url}/todos`, { method: "POST", body: "{}" });

    expect(response.status).toBe(201);
  });

  it("leave the handler under the override as it was", () => {
    const auto: ResolvedHandler = { fn: () => ["auto"], status: 200, isError: false };
    const registered: ResolvedHandler[] = [];

    createEnhancedMockBuilder((h) => registered.push(h), auto)
      .delay(400)
      .withHeaders({ "X-Stub": "yes" })
      .resolves(["stub"]);

    expect(auto).toEqual({ fn: auto.fn, status: 200, isError: false });
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ delayMs: 400, headers: { "X-Stub": "yes" } });
    expect(registered[0]?.fn({} as never)).toEqual(["stub"]);
  });
});
