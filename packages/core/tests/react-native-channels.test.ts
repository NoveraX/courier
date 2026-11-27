/**
 * A channel in a React Native app, over React Native's own WebSocket, to a
 * Courier server in a process of its own, whichever `fetch` the app has.
 * Its socket opens with the API's headers and with the origin React
 * Native's native side names from the socket's own address, which the
 * server takes for its own, whatever pages it lists besides; what the app
 * sends comes back as it was, in any script; a socket the network cuts
 * reports an error and then a close of 1006, and the channel comes back on
 * another, missing nothing the room was sent meanwhile and doubling
 * nothing, as it does from a socket a network the device left holds open,
 * on which nothing comes any more; and a channel the app closes closes its
 * socket with a code React Native's native side takes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { type AppServer, serveApp } from "./helpers/app-server";
import {
  type AppFetch,
  asReactNative,
  forgetSockets,
  NativeWebSocket,
} from "./helpers/react-native";

const { channel } = courier();
const TEXT = "naïve café in Zürich — ½ off ✓ 🚀";

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

/** The room, joined as the app joins it, and what it hears; its socket made again `backoffMs` after one is lost. */
function join(url: string, backoffMs = 10) {
  const backoff = { initialMs: backoffMs, maxMs: backoffMs, jitter: false };
  const room = createCaller(appApi(url), { ws: { backoff } }).live.room();
  const heard: string[] = [];
  room.on("data", (message) => heard.push(message));
  return { room, heard };
}

describe.each<AppFetch>(["react-native", "expo", "expo-with-react-native-fetch"])(
  "a channel in a React Native app whose fetch is %s's",
  (fetch) => {
    it("opens its socket with the API's headers and its own origin, and carries text of any script", async () => {
      server = await serveApp();
      asReactNative(fetch);
      const { room, heard } = join(server.url);
      await vi.waitFor(() => expect(room.status).toBe("connected"));

      room.send(TEXT);

      await vi.waitFor(() => expect(heard).toEqual([`echo ${TEXT}`]));
      expect(server.opened).toEqual([
        expect.objectContaining({
          authorization: "Bearer app-token",
          origin: server.url.replace(/^ws:/, "http:"),
        }),
      ]);
      expect(NativeWebSocket.made).toHaveLength(1);
      room.close();
    });

    it("is admitted by a server that lists the pages it admits: its origin is the server's own", async () => {
      server = await serveApp({ allowedOrigins: ["https://shop.example"] });
      asReactNative(fetch);
      const { room, heard } = join(server.url);
      await vi.waitFor(() => expect(room.status).toBe("connected"));

      room.send("hello");

      await vi.waitFor(() => expect(heard).toEqual(["echo hello"]));
      expect(server.ended).toEqual([]);
      room.close();
    });

    it("comes back on another socket once the network cuts its own, missing nothing and doubling nothing", async () => {
      server = await serveApp();
      asReactNative(fetch);
      const { room, heard } = join(server.url, 300);
      await vi.waitFor(() => expect(room.status).toBe("connected"));
      await server.broadcast("first");
      await vi.waitFor(() => expect(heard).toEqual(["first"]));

      NativeWebSocket.made[0]?.cut();
      await vi.waitFor(() => expect(server?.ended).toEqual([1006]));
      await server.broadcast("while away");
      await vi.waitFor(() => expect(room.status).toBe("connected"), { timeout: 3000 });
      await server.broadcast("after");

      await vi.waitFor(() => expect(heard).toEqual(["first", "while away", "after"]));
      expect(NativeWebSocket.made).toHaveLength(2);
      room.close();
    });

    it("lets go of a socket nothing comes on any more, as a network the device left holds one, and comes back", async () => {
      server = await serveApp({ heartbeatMs: 200 });
      asReactNative(fetch);
      const { room, heard } = join(server.url);
      await vi.waitFor(() => expect(room.status).toBe("connected"));
      await server.broadcast("first");
      await vi.waitFor(() => expect(heard).toEqual(["first"]));

      NativeWebSocket.made[0]?.stall();
      await server.broadcast("while stalled");
      await vi.waitFor(() => expect(NativeWebSocket.made).toHaveLength(2), { timeout: 3000 });
      await vi.waitFor(() => expect(room.status).toBe("connected"));
      await server.broadcast("after");

      await vi.waitFor(() => expect(heard).toEqual(["first", "while stalled", "after"]));
      expect(NativeWebSocket.refused).toEqual([]);
      room.close();
    });

    it("closes its socket, once the app closes the channel, with a code React Native's native side takes", async () => {
      server = await serveApp();
      asReactNative(fetch);
      const { room } = join(server.url);
      await vi.waitFor(() => expect(room.status).toBe("connected"));

      room.close();

      await vi.waitFor(() => expect(server?.ended).toEqual([1000]), { timeout: 3000 });
      expect(NativeWebSocket.refused).toEqual([]);
    });
  },
);
