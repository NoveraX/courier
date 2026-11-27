/**
 * A channel in a React Native app whose network lets no WebSocket through —
 * every upgrade answered 403, as a proxy would — goes on over HTTP to the
 * same path, whichever `fetch` the app has: on a stream under expo/fetch,
 * which hands an answer over as it comes, and at once on polls under React
 * Native's own, which hands one over only once all of it has arrived — with
 * web streams under Expo, and without any where there is no Expo. Over
 * either, the connection opens with the API's headers, carries text of any
 * script both ways, and closes with the app's close. A refusal React
 * Native's fetch hands over whole says the server's code as one streamed
 * does: a refusal of the server's own ends the connection, as it ends a
 * socket, rather than its being made again and again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { postedOf } from "../src/realtime/ws-http/http-post";
import { type AppServer, serveApp } from "./helpers/app-server";
import { type AppFetch, asReactNative, forgetSockets, polyfill } from "./helpers/react-native";

const { channel } = courier();
const TEXT = "naïve café in Zürich — ½ off ✓ 🚀";
/* Long enough that a stream held back, waited out before polls, would not open the channel in time. */
const AFTER_MS = 5000;

let server: AppServer | undefined;

afterEach(async () => {
  clearWSConnectionPool();
  forgetSockets();
  vi.unstubAllGlobals();
  await server?.stop();
  server = undefined;
});

/** The app's API: the room on the server's origin, its calls and its sockets carrying the app's token. */
function appApi(url: string) {
  return defineApi({
    name: "api",
    baseURL: url.replace(/^ws:/, "http:"),
    headers: { Authorization: "Bearer app-token" },
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: { room: channel.send<string>().response<string>().connect("room") },
      }),
    },
  });
}

/** The room, joined as the app joins it, and what it hears. */
function join(url: string) {
  const backoff = { initialMs: 10, maxMs: 10, jitter: false };
  const ws = { backoff, fallback: { after: AFTER_MS } };
  const room = createCaller(appApi(url), { ws }).live.room();
  const heard: string[] = [];
  room.on("data", (message) => heard.push(message));
  return { room, heard };
}

describe.each<[AppFetch, "streaming" | "polling"]>([
  ["expo", "streaming"],
  ["react-native", "polling"],
  ["expo-with-react-native-fetch", "polling"],
])("a channel in a React Native app whose fetch is %s's, its upgrades refused", (fetch, way) => {
  it(`goes on over HTTP at once, ${way}, with the API's headers and text of any script both ways`, async () => {
    server = await serveApp({ refuseUpgrades: true });
    asReactNative(fetch);
    const { room, heard } = join(server.url);
    await vi.waitFor(() => expect(room.status).toBe("connected"), { timeout: 3000 });

    await server.broadcast("first");
    room.send(TEXT);

    await vi.waitFor(() => expect(heard).toEqual(["first", `echo ${TEXT}`]));
    const stats = await server.stats();
    expect(stats.http?.fallbacks).toMatchObject({ refused: 1, held: 0 });
    await vi.waitFor(async () => expect((await server?.stats())?.http?.[way]).toBe(1));
    expect(server.opened).toEqual([expect.objectContaining({ authorization: "Bearer app-token" })]);
    room.close();
  });

  it("closes the connection over HTTP once the app closes the channel", async () => {
    server = await serveApp({ refuseUpgrades: true });
    asReactNative(fetch);
    const { room } = join(server.url);
    await vi.waitFor(() => expect(room.status).toBe("connected"), { timeout: 3000 });

    room.close();

    await vi.waitFor(() => expect(server?.ended).toEqual([1000]), { timeout: 3000 });
    expect((await server.stats()).http?.connections).toBe(0);
  });
});

describe("a refusal React Native's fetch hands over whole", () => {
  it.each([
    ["HOST_NOT_ALLOWED", 421, 4421],
    ["ORIGIN_NOT_ALLOWED", 403, 4403],
    ["BODY_MALFORMED", 400, 1002],
  ])(
    "names the server's %s, and ends the connection as a socket would end",
    async (code, status, close) => {
      const message = `Refused — ${code} ✓`;
      const answer = new polyfill.Response(JSON.stringify({ code, message }), {
        status,
        headers: { "Content-Type": "application/json" },
      });

      const posted = await postedOf(answer, new AbortController().signal);

      expect(posted).toEqual({ kind: "refused", code: close, reason: message });
    },
  );

  it("says nothing past the bound a streamed refusal is read to", async () => {
    const said = JSON.stringify({ code: "HOST_NOT_ALLOWED", message: "é".repeat(2100) });
    const answer = new polyfill.Response(said, {
      status: 421,
      headers: { "Content-Type": "application/json" },
    });

    const posted = await postedOf(answer, new AbortController().signal);

    expect(posted).toEqual({
      kind: "refused",
      code: 1006,
      reason: "The socket's path answered 421",
    });
  });
});
