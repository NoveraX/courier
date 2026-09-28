/**
 * A source whose baseURL has a path is answered under that path too.
 *
 * A client pointed at the mock with only the host of `https://api.example/api/v3`
 * swapped calls `/api/v3/users`, which the mock answered with "Route not
 * found": it served the groups at their prefixes alone.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint, stream, channel } = courier();
const Text = z.object({ text: z.string() });
const User = z.object({ id: z.number(), name: z.string() });

function usersApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          list: endpoint.get("").response(z.array(User)),
          get: endpoint.get(":id").variables<{ id: number }>().response(User),
          feed: stream.response(z.object({ n: z.number() })).get("feed"),
          chat: channel.response(Text).send(Text).connect("chat"),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function serve(baseURL: string): Promise<string> {
  const server = createAutoMockServer({
    source: usersApi(baseURL),
    port: 0,
    log: false,
    seed: { count: 3 },
    overrides: (mock) => {
      mock("users", "feed").emits([{ data: { n: 1 } }]);
      mock("users", "chat").channel(() => ({
        onMessage(ctx, message) {
          ctx.send({ text: `echo:${JSON.stringify(message)}` });
        },
      }));
    },
  });
  running.push(server);
  return (await server.start()).url;
}

describe("a mock of a source whose baseURL has a path", () => {
  it("answers a client that keeps the path", async () => {
    const url = await serve("https://api.example/api/v3");
    const client = createCaller(usersApi(`${url}/api/v3`));

    const users = await client.users.list();
    const first = await client.users.get({ id: users[0]?.id ?? 0 });

    expect(users).toHaveLength(3);
    expect(first).toEqual(users[0]);
  });

  it("answers a client pointed at its bare URL too", async () => {
    const url = await serve("https://api.example/api/v3/");

    const response = await fetch(`${url}/users`);

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(3);
  });

  it("accepts a channel under the path", async () => {
    const url = await serve("https://api.example/api/v3");
    const room = createCaller(usersApi(`${url}/api/v3`)).users.chat();

    const echoed = new Promise<unknown>((resolve, reject) => {
      room.on("data", resolve);
      room.on("error", reject);
    });
    room.send({ text: "hi" });

    expect(await echoed).toEqual({ text: 'echo:{"text":"hi"}' });
    room.close();
  });

  it("streams under the path", async () => {
    const url = await serve("https://api.example/api/v3");

    const response = await fetch(`${url}/api/v3/users/feed`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"n":1');
  });

  it("serves a relative baseURL's path the same way, before addressing by name", async () => {
    const url = await serve("/api");

    const users: Array<{ id: number }> = await (await fetch(`${url}/api/users`)).json();
    const first = await fetch(`${url}/api/users/${users[0]?.id}`);

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(users[0]);
  });
});
