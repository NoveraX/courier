/**
 * A mock that answers anew replaces the earlier one's answer and its
 * decorations; one that only decorates keeps the earlier answer.
 *
 * The builder started every chain from a copy of the handler already
 * registered, so a later plain `resolves()` inherited `once()`, `inState()`,
 * `delay()` and even a stream transport. And the server's base-layer `mock`
 * looked at the scenario layer too, so a mock written while a scenario was
 * active copied the scenario's answer into the base layer for good.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { createMockClient } from "../src/create-mock-client";
import { createMockServer } from "../src/server/create-mock-server";
import { defineScenario } from "../src/scenario";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "http://placeholder.invalid",
  groups: {
    users: defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<string>() } }),
  },
});

async function answers(client: { users: { getAll(): Promise<string> } }, calls: number) {
  const out: string[] = [];
  for (let call = 0; call < calls; call++) {
    out.push(await client.users.getAll().catch((error: unknown) => `error: ${String(error)}`));
  }
  return out;
}

describe("a later plain mock in the mock client", () => {
  it("is permanent after a once() mock", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("users", "getAll").once().resolves("a");
    mock("users", "getAll").resolves("b");

    expect(await answers(client, 3)).toEqual(["b", "b", "b"]);
  });

  it("answers in every state after an inState() mock", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("users", "getAll").inState("LoggedIn").resolves("a");
    mock("users", "getAll").resolves("b");

    expect(await answers(client, 1)).toEqual(["b"]);
  });

  it("answers at once after a delay() mock", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("users", "getAll").delay(400).resolves("a");
    mock("users", "getAll").resolves("b");

    const started = performance.now();
    expect(await answers(client, 1)).toEqual(["b"]);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("answers over HTTP after an emits() mock", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("users", "getAll").emits([{ data: "tick" }]);
    mock("users", "getAll").resolves("b");

    expect(await answers(client, 1)).toEqual(["b"]);
  });

  it("keeps decorations written earlier in its own chain", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("users", "getAll").resolves("a");
    mock("users", "getAll").once().resolves("b");

    expect(await answers(client, 2)).toEqual(["b", "a"]);
  });

  it("keeps the earlier answer when it only decorates", async () => {
    const { client, mock, history } = createMockClient<typeof api>();
    mock("users", "getAll").resolves("a");
    mock("users", "getAll").withHeaders({ "x-extra": "1" });

    expect(await answers(client, 1)).toEqual(["a"]);
    expect(history[0]?.result?.headers).toEqual({ "x-extra": "1" });
  });
});

describe("the mock server's base layer", () => {
  const running: Array<{ stop(): Promise<void> }> = [];
  afterEach(async () => {
    for (const server of running.splice(0)) await server.stop();
  });

  async function start(server: ReturnType<typeof createMockServer>): Promise<string> {
    running.push(server);
    return (await server.start()).url;
  }

  it("replaces a once() mock's answer with a later plain one", async () => {
    const server = createMockServer({ port: 0, log: false });
    server.mock("users", "getAll").resolves("default");
    server.mock("users", "getAll").once().resolves("first");
    server.mock("users", "getAll").resolves("later");
    const url = await start(server);

    const bodies = [];
    for (let call = 0; call < 3; call++) bodies.push(await (await fetch(`${url}/api/users/getAll`)).json());
    expect(bodies).toEqual(["later", "later", "later"]);
  });

  it("does not take in the active scenario's answer", async () => {
    const outage = defineScenario("outage", (mock) => {
      mock("users", "getAll").rejects(503, { message: "down" });
    });
    const server = createMockServer({ port: 0, log: false, scenarios: { outage } });
    server.mock("users", "getAll").resolves("ok");
    const url = await start(server);

    await fetch(`${url}/__admin/scenarios/outage`, { method: "POST" });
    server.mock("users", "getAll").withHeaders({ "x-mocked": "1" });
    expect((await fetch(`${url}/api/users/getAll`)).status).toBe(503);

    await fetch(`${url}/__admin/reset`, { method: "POST" });
    const after = await fetch(`${url}/api/users/getAll`);
    expect(after.status).toBe(200);
    expect(after.headers.get("x-mocked")).toBe("1");
    expect(await after.json()).toBe("ok");
  });
});
