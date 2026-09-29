/**
 * `.sequence()` entries answered on the call they belong to, with the
 * status and delay each one declares.
 *
 * The mock client checked whether a handler was an error before running it,
 * while a sequence decides that as it runs, so each error entry was answered
 * one call late: its body as a success, then the next success as an error
 * with status 200. A `{ data, status, delay }` entry lost both its status
 * and its delay.
 */
import { HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { createMockClient } from "../src/create-mock-client";
import { createMockServer } from "../src/server/create-mock-server";

const { endpoint } = courier();
type User = { id: number; name: string };
const api = defineApi({
  baseURL: "http://placeholder.invalid",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response<User[]>() },
    }),
  },
});

const alice = { id: 1, name: "Alice" };
const bob = { id: 2, name: "Bob" };

async function outcome(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    (data) => ({ ok: data }),
    (error: unknown) =>
      error instanceof HTTPError
        ? { status: error.status, data: error.data }
        : { thrown: String(error) },
  );
}

describe("a sequence in the mock client", () => {
  it("answers each entry on its own call, errors included", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("users", "getAll").sequence([
      [alice],
      { error: true, status: 503, data: { message: "down" } },
      { data: [bob] },
    ]);

    const answers = [];
    for (let call = 0; call < 4; call++) answers.push(await outcome(client.users.getAll()));

    expect(answers).toEqual([
      { ok: [alice] },
      { status: 503, data: { message: "down" } },
      { ok: [bob] },
      { ok: [bob] },
    ]);
  });

  it("waits the delay an entry declares", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("users", "getAll").sequence([{ data: [alice], delay: 80 }, [bob]]);

    const started = performance.now();
    await client.users.getAll();
    expect(performance.now() - started).toBeGreaterThanOrEqual(75);

    const again = performance.now();
    await client.users.getAll();
    expect(performance.now() - again).toBeLessThan(75);
  });
});

describe("a sequence on the mock server", () => {
  const running: Array<{ stop(): Promise<void> }> = [];
  afterEach(async () => {
    for (const server of running.splice(0)) await server.stop();
  });

  it("answers with the status and after the delay each entry declares", async () => {
    const server = createMockServer({ port: 0, log: false });
    running.push(server);
    server
      .mock("users", "getAll")
      .sequence([
        { data: [alice], status: 201, delay: 80 },
        { error: true, status: 429, data: { message: "slow down" } },
        [bob],
      ]);
    const { url } = await server.start();
    const call = () => fetch(`${url}/api/users/getAll`);

    const started = performance.now();
    const first = await call();
    expect(first.status).toBe(201);
    expect(performance.now() - started).toBeGreaterThanOrEqual(75);
    expect((await call()).status).toBe(429);
    const third = await call();
    expect(third.status).toBe(200);
    expect(await third.json()).toEqual([bob]);
  });
});
