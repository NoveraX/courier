/**
 * Replaying recordings: each call answers what was recorded for it.
 *
 * `replayFixtures` resolved every recording as data, so a recorded 404 came
 * back as a success carrying the error body, and it answered an endpoint's
 * recordings in the order they were made whatever the call's variables.
 */
import { HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { createMockClient } from "../src/create-mock-client";
import { RecorderError } from "../src/record/errors";
import type { Fixture } from "../src/record/fixture";
import { replayFixtures } from "../src/record/replay";
import { createMockServer } from "../src/server/create-mock-server";
import { MockHttpError } from "../src/server/errors";

const { endpoint } = courier();
type User = { id: number; name: string };
const api = defineApi({
  baseURL: "http://placeholder.invalid",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        getAll: endpoint.get("").response<User[]>(),
        getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),
      },
    }),
  },
});

function fixture(method: string, variables: unknown, status: number, data: unknown): Fixture {
  return {
    group: "users",
    method,
    variables,
    response: { status, data, headers: {} },
    duration: 1,
    recordedAt: "2026-01-01T00:00:00.000Z",
  };
}

const recordings = [
  fixture("getById", { id: 9 }, 404, { message: "no such user" }),
  fixture("getById", { id: 1 }, 200, { id: 1, name: "Alice" }),
  fixture("getAll", undefined, 200, []),
  fixture("getAll", undefined, 200, [{ id: 1, name: "Alice" }]),
];

describe("replaying in the mock client", () => {
  it("answers each call with the recording made for its variables", async () => {
    const { client } = createMockClient<typeof api>({ scenario: replayFixtures(recordings) });

    expect(await client.users.getById({ id: 1 })).toEqual({ id: 1, name: "Alice" });
    expect(await client.users.getById({ id: 1 })).toEqual({ id: 1, name: "Alice" });
  });

  it("rejects with the recorded error status and body", async () => {
    const { client } = createMockClient<typeof api>({ scenario: replayFixtures(recordings) });

    const failure = await client.users.getById({ id: 9 }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HTTPError);
    expect((failure as HTTPError).status).toBe(404);
    expect((failure as HTTPError).data).toEqual({ message: "no such user" });
  });

  it("answers repeated recordings of the same call in order, then the last", async () => {
    const { client } = createMockClient<typeof api>({ scenario: replayFixtures(recordings) });

    expect(await client.users.getAll()).toEqual([]);
    expect(await client.users.getAll()).toEqual([{ id: 1, name: "Alice" }]);
    expect(await client.users.getAll()).toEqual([{ id: 1, name: "Alice" }]);
  });

  it("refuses a call nothing was recorded for", async () => {
    const { client } = createMockClient<typeof api>({ scenario: replayFixtures(recordings) });

    await expect(client.users.getById({ id: 5 })).rejects.toBeInstanceOf(RecorderError);
  });
});

describe("a handler that throws, in the mock client", () => {
  it("rejects with the status of a MockHttpError, as the mock server answers it", async () => {
    const { client, mock, history } = createMockClient<typeof api>();
    mock("users", "getById").returns(() => {
      throw new MockHttpError(404, "users with id 5 not found");
    });

    const failure = await client.users.getById({ id: 5 }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HTTPError);
    expect((failure as HTTPError).status).toBe(404);
    expect((failure as HTTPError).data).toEqual({ error: "users with id 5 not found" });
    expect(history[0]?.error).toBe(failure);
  });
});

describe("replaying on the mock server", () => {
  const running: Array<{ stop(): Promise<void> }> = [];
  afterEach(async () => {
    for (const server of running.splice(0)) await server.stop();
  });

  it("answers the recorded status and body", async () => {
    const server = createMockServer({ port: 0, log: false, scenario: replayFixtures(recordings) });
    running.push(server);
    const { url } = await server.start();
    const call = (variables: unknown) =>
      fetch(`${url}/api/request?_s=api&_g=users&_m=getById`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      });

    const missing = await call({ id: 9 });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ message: "no such user" });
    const found = await call({ id: 1 });
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ id: 1, name: "Alice" });
  });
});
