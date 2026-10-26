/**
 * @vitest-environment node
 *
 * Parameters written in braces, served by the mock where the client sends
 * them: a Google `{+name}` takes the segments its value's slashes divide —
 * `/v1/projects/p/operations/o` and its `:cancel` method — and a `{name}`
 * that text follows at once takes its part of the segment, while a route of
 * text or of one segment is still tried before the `{+name}` that could
 * take it too, and so is one whose path goes on past its own `{+name}`, as
 * Google's list `v2/{+parent}/services` does beside its get `v2/{+name}`.
 * A stream's and a channel's routes are tried in the same order.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint, stream, channel } = courier();
const Done = z.object({ ok: z.boolean() });
const Tick = z.object({ n: z.string() });
const Text = z.object({ text: z.string() });

function google(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      operations: defineGroup({
        prefix: "v1",
        endpoints: {
          get: endpoint.get("{+name}").variables<{ name: string }>().response(Done),
          cancel: endpoint.post("{+name}::cancel").variables<{ name: string }>().response(Done),
          file: endpoint.get("files/{id}abc").variables<{ id: string }>().response(Done),
        },
      }),
    },
  });
}

const server = createAutoMockServer({
  source: google("http://placeholder.invalid"),
  port: 0,
  log: false,
  seed: { count: 2 },
});

let url: string;
beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});

const answered = () => {
  const last = server.history.at(-1);
  return last && { method: last.method, variables: last.variables };
};

describe("a parameter written {+name}", () => {
  it("takes the segments its value spans, as the client sends them", async () => {
    const client = createCaller(google(url));

    await client.operations.get({ name: "projects/p/operations/o" });
    expect(answered()).toEqual({ method: "get", variables: { name: "projects/p/operations/o" } });

    await client.operations.cancel({ name: "projects/p/operations/o" });
    expect(answered()).toEqual({
      method: "cancel",
      variables: { name: "projects/p/operations/o" },
    });
  });

  it("answers at the path the client sends, its value's segments read back whole", async () => {
    const response = await fetch(`${url}/v1/projects/p%201/operations/o`);

    expect(response.status).toBe(200);
    expect(answered()).toEqual({ method: "get", variables: { name: "projects/p 1/operations/o" } });
  });
});

describe("a parameter written {name} that text follows", () => {
  it("takes its part of the segment, before the {+name} that could take the whole path", async () => {
    await createCaller(google(url)).operations.file({ id: "x7" });
    expect(answered()).toEqual({ method: "file", variables: { id: "x7" } });

    const response = await fetch(`${url}/v1/files/y8abc`);
    expect(response.status).toBe(200);
    expect(answered()).toEqual({ method: "file", variables: { id: "y8" } });
  });
});

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const mock of running.splice(0)) await mock.stop();
});

/* Google's get and list of one resource: the list's path goes on past its {+parent}. */
function services(baseURL: string, listFirst: boolean) {
  const get = endpoint.get("{+name}").variables<{ name: string }>().response(Done);
  const list = endpoint.get("{+parent}/services").variables<{ parent: string }>().response(Done);
  return defineApi({
    baseURL,
    groups: {
      services: defineGroup({
        prefix: "v2",
        endpoints: listFirst ? { list, get } : { get, list },
      }),
    },
  });
}

describe("a {+name} beside a path that goes on past a {+name} of its own", () => {
  it.each([
    ["the get", false],
    ["the list", true],
  ])("answers each at its own path, %s declared first", async (_, listFirst) => {
    const mock = createAutoMockServer({
      source: services("http://placeholder.invalid", listFirst),
      port: 0,
      log: false,
      seed: { count: 1 },
    });
    running.push(mock);
    const client = createCaller(services((await mock.start()).url, listFirst));
    const answer = () => {
      const last = mock.history.at(-1);
      return last && { method: last.method, variables: last.variables };
    };

    await client.services.list({ parent: "projects/p/locations/l" });
    expect(answer()).toEqual({ method: "list", variables: { parent: "projects/p/locations/l" } });

    await client.services.get({ name: "projects/p/locations/l/services/s" });
    expect(answer()).toEqual({
      method: "get",
      variables: { name: "projects/p/locations/l/services/s" },
    });
  });
});

/* Streams and channels, each {+name} declared before the routes it could take the requests of. */
function rooms(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          wide: stream.variables<{ name: string }>().response(Tick).get("rooms/{+name}"),
          room: stream.variables<{ id: string }>().response(Tick).get("rooms/:id"),
          stats: stream.response(Tick).get("rooms/stats"),
          wideChat: channel
            .variables<{ name: string }>()
            .response(Text)
            .send(Text)
            .connect("chat/{+name}"),
          roomChat: channel
            .variables<{ id: string }>()
            .response(Text)
            .send(Text)
            .connect("chat/:id"),
        },
      }),
    },
  });
}

async function serveRooms(): Promise<string> {
  const echo = (name: string) => () => ({
    onMessage(ctx: { send(data: unknown): void }) {
      ctx.send({ text: name });
    },
  });
  const mock = createAutoMockServer({
    source: rooms("http://placeholder.invalid"),
    port: 0,
    log: false,
    overrides: (mocks) => {
      mocks("live", "wide").emits([{ data: { n: "wide" } }]);
      mocks("live", "room").emits([{ data: { n: "room" } }]);
      mocks("live", "stats").emits([{ data: { n: "stats" } }]);
      mocks("live", "wideChat").channel(echo("wide"));
      mocks("live", "roomChat").channel(echo("room"));
    },
  });
  running.push(mock);
  return (await mock.start()).url;
}

async function collect<TData>(subscription: AsyncIterable<{ data: TData }>): Promise<TData[]> {
  const received: TData[] = [];
  for await (const event of subscription) received.push(event.data);
  return received;
}

async function answerOf(subscription: {
  on(event: "data" | "error", listener: (value: unknown) => void): void;
  send(data: { text: string }): void;
  close(): void;
}): Promise<unknown> {
  const answer = new Promise<unknown>((resolve, reject) => {
    subscription.on("data", resolve);
    subscription.on("error", reject);
  });
  subscription.send({ text: "hi" });
  try {
    return await answer;
  } finally {
    subscription.close();
  }
}

describe("a stream's or a channel's routes", () => {
  it("are tried as an HTTP endpoint's are, text and one segment before a {+name}", async () => {
    const client = createCaller(rooms(await serveRooms()));

    expect(await collect(client.live.room({ id: "lobby" }))).toEqual([{ n: "room" }]);
    expect(await collect(client.live.stats())).toEqual([{ n: "stats" }]);
    expect(await collect(client.live.wide({ name: "floor/1" }))).toEqual([{ n: "wide" }]);
  });

  it("connect a channel as an HTTP endpoint's are matched, one segment before a {+name}", async () => {
    const client = createCaller(rooms(await serveRooms()));

    expect(await answerOf(client.live.roomChat({ id: "lobby" }))).toEqual({ text: "room" });
    expect(await answerOf(client.live.wideChat({ name: "floor/1" }))).toEqual({ text: "wide" });
  });
});
