/**
 * The recorder against real backends: a plain REST API, and a Courier proxy
 * serving one.
 *
 * It calls each target as that target is called — an endpoint's own method
 * and path on a REST API, the proxy envelope with its source on a Courier
 * server — so no refusal is recorded as the fixture; it honours its `mode`;
 * and a failed call rejects with the status and the body.
 */
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createHandler, HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Fixture } from "../src/record/fixture";
import { createRecorder } from "../src/record/recorder";

const { endpoint } = courier();

type User = { id: number; name: string; token: string };
const USERS: User[] = [
  { id: 1, name: "Alice", token: "secret-1" },
  { id: 2, name: "Bob", token: "secret-2" },
];

function usersApi(baseURL: string) {
  return defineApi({
    baseURL,
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
}

function answer(url: string): { status: number; body: unknown } {
  const { pathname } = new URL(url, "http://upstream");
  if (pathname === "/users") return { status: 200, body: USERS };
  const user = USERS.find((u) => pathname === `/users/${u.id}`);
  return user ? { status: 200, body: user } : { status: 404, body: { message: "no such user" } };
}

let upstream: Server;
let upstreamUrl: string;
let proxy: ReturnType<typeof serve>;
let proxyUrl: string;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    const { status, body } = answer(req.url ?? "/");
    res.writeHead(status, {
      "content-type": "application/json",
      "x-upstream": "yes",
      "set-cookie": "sid=abc",
    });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  const handler = createHandler({ sources: { api: usersApi(upstreamUrl) } });
  await new Promise<void>((resolve) => {
    proxy = serve(
      { fetch: (req) => handler.handle(req), port: 0, hostname: "127.0.0.1" },
      (info) => {
        proxyUrl = `http://127.0.0.1:${info.port}`;
        resolve();
      },
    );
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("recording against a plain REST API", () => {
  it("calls the endpoints' REST paths and records what they answered", async () => {
    const recorder = createRecorder({
      source: usersApi("http://placeholder.invalid"),
      targetUrl: upstreamUrl,
    });

    expect(await recorder.client.users.getAll()).toEqual(USERS);
    expect(await recorder.client.users.getById({ id: 2 })).toEqual(USERS[1]);

    const fixtures = recorder.getFixtures();
    expect(fixtures.map((f) => [f.method, f.response.status])).toEqual([
      ["getAll", 200],
      ["getById", 200],
    ]);
    expect(fixtures[1]?.variables).toEqual({ id: 2 });
    expect(fixtures[0]?.response.headers["x-upstream"]).toBe("yes");
    expect(fixtures[1]?.request).toEqual({ method: "GET", url: `${upstreamUrl}/users/2` });
  });

  it("goes to the source's own base URL when no target is named", async () => {
    const recorder = createRecorder({ source: usersApi(upstreamUrl) });
    expect(await recorder.client.users.getAll()).toEqual(USERS);
  });

  it("rejects a failed call with its status and body, and records it", async () => {
    const recorder = createRecorder({ source: usersApi(upstreamUrl) });

    const failure = await recorder.client.users.getById({ id: 9 }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HTTPError);
    expect((failure as HTTPError).status).toBe(404);
    expect((failure as HTTPError).data).toEqual({ message: "no such user" });
    expect(recorder.getFixtures()[0]?.response).toMatchObject({
      status: 404,
      data: { message: "no such user" },
    });
  });

  it("sanitizes what it records, not what it returns", async () => {
    const recorder = createRecorder({
      source: usersApi(upstreamUrl),
      sanitize: (data) => JSON.parse(JSON.stringify(data).replace(/secret-\d/g, "[redacted]")),
    });

    expect(await recorder.client.users.getById({ id: 1 })).toEqual(USERS[0]);
    expect(JSON.stringify(recorder.getFixtures())).not.toContain("secret-1");
  });
});

describe("recording through a Courier proxy", () => {
  it("sends the calls to the proxy route under the source's name there", async () => {
    const recorder = createRecorder({
      source: usersApi("http://placeholder.invalid"),
      proxy: { url: `${proxyUrl}/api/request`, source: "api" },
    });

    expect(await recorder.client.users.getAll()).toEqual(USERS);
    const failure = await recorder.client.users.getById({ id: 9 }).catch((error: unknown) => error);
    expect((failure as HTTPError).status).toBe(404);
    expect(recorder.getFixtures().map((f) => f.response.status)).toEqual([200, 404]);
  });

  it("names the proxy request with the call it routes, as the proxy caller sends it", async () => {
    const recorder = createRecorder({
      source: usersApi("http://placeholder.invalid"),
      proxy: { url: `${proxyUrl}/api/request`, source: "api" },
    });

    await recorder.client.users.getAll();

    expect(recorder.getFixtures()[0]?.request).toEqual({
      method: "POST",
      url: `${proxyUrl}/api/request?_s=api&_g=users&_m=getAll`,
    });
  });
});

describe("recording modes", () => {
  const recorded: Fixture[] = [
    {
      group: "users",
      method: "getById",
      variables: { id: 1 },
      response: { status: 200, data: { id: 1, name: "Recorded" }, headers: {} },
      duration: 3,
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("replay answers from the recordings without touching the network", async () => {
    const recorder = createRecorder({
      source: usersApi("http://127.0.0.1:1"),
      mode: "replay",
      fixtures: recorded,
    });

    expect(await recorder.client.users.getById({ id: 1 })).toEqual({ id: 1, name: "Recorded" });
    await expect(recorder.client.users.getById({ id: 2 })).rejects.toThrow(/No recording/);
  });

  it("passthrough calls the backend and records nothing", async () => {
    const recorder = createRecorder({ source: usersApi(upstreamUrl), mode: "passthrough" });

    expect(await recorder.client.users.getAll()).toEqual(USERS);
    expect(recorder.getFixtures()).toEqual([]);
  });

  it("record-missing replays what it has and records the rest", async () => {
    const recorder = createRecorder({
      source: usersApi(upstreamUrl),
      mode: "record-missing",
      fixtures: recorded,
    });

    expect(await recorder.client.users.getById({ id: 1 })).toEqual({ id: 1, name: "Recorded" });
    expect(await recorder.client.users.getById({ id: 2 })).toEqual(USERS[1]);
    expect(recorder.getFixtures().map((f) => f.variables)).toEqual([{ id: 2 }]);
  });
});

describe("the HAR a recorder writes", () => {
  it("dates each entry when it was recorded and names the request it made", async () => {
    const recorder = createRecorder({ source: usersApi(upstreamUrl) });
    await recorder.client.users.getById({ id: 1 });

    const [entry] = recorder.toHar().log.entries;
    const [fixture] = recorder.getFixtures();
    expect(entry?.startedDateTime).toBe(fixture?.recordedAt);
    expect(entry?.request).toMatchObject({ method: "GET", url: `${upstreamUrl}/users/1` });
  });
});

/**
 * `sanitize` rewrote each answer's body only: the variables a call was made
 * with — a password, a token — its URL's query and the answer's cookies went
 * into the recording as they were.
 */
describe("what a recording keeps of a call's credentials", () => {
  const redact = (data: unknown) =>
    JSON.parse(JSON.stringify(data).replace(/secret-\d|hunter2/g, "[redacted]"));

  it("rewrites the variables and the URL's query, and drops the credential headers", async () => {
    const recorder = createRecorder({ source: usersApi(upstreamUrl), sanitize: redact });

    await recorder.client.users.getById({ id: 1, password: "hunter2" } as { id: number });

    const [fixture] = recorder.getFixtures();
    expect(fixture?.variables).toEqual({ id: 1, password: "[redacted]" });
    expect(fixture?.request?.url).not.toContain("?");
    expect(fixture?.response.headers).not.toHaveProperty("set-cookie");
    expect(fixture?.response.headers).toHaveProperty("x-upstream", "yes");
    expect(JSON.stringify(recorder.toHar())).not.toMatch(/hunter2|secret-1|sid=/);
  });

  it("finds a recording made with the sanitizer for the call it stands for", async () => {
    const recording = createRecorder({ source: usersApi(upstreamUrl), sanitize: redact });
    await recording.client.users.getById({ id: 1, password: "hunter2" } as { id: number });

    const replay = createRecorder({
      source: usersApi("http://offline.invalid"),
      mode: "replay",
      fixtures: recording.getFixtures(),
      sanitize: redact,
    });

    await expect(
      replay.client.users.getById({ id: 1, password: "hunter2" } as { id: number }),
    ).resolves.toMatchObject({ id: 1, name: "Alice", token: "[redacted]" });
  });
});
