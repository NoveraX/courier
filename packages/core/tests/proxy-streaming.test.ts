/**
 * What a proxy client refuses where a stream or a channel is called. Their
 * client code loads on the first call, and a proxy path that cannot be
 * resolved is refused at the call, before it loads — not afterwards, as a
 * client that "could not be loaded".
 */
import { describe, expect, it } from "vitest";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";

const { channel, stream } = courier();

const api = defineApi({
  expose: true,
  baseURL: "https://api.example",
  groups: {
    live: defineGroup({
      prefix: "live",
      endpoints: {
        room: channel.send<string>().response<string>().connect("room"),
        feed: stream.response<number>().get("feed"),
      },
    }),
  },
});

describe("a proxy client's streams and channels", () => {
  it("refuses a channel where it is called when no WebSocket proxy path is set", () => {
    const client = createProxyCaller(routesOf(api, "api"));

    expect(() => client.live.room()).toThrow(
      expect.objectContaining({ code: "WS_PATH_NOT_CONFIGURED" }),
    );
  });

  it("refuses a stream where it is called when its proxy path is not one", () => {
    const client = createProxyCaller(routesOf(api, "api"), { proxyPath: { sse: "sse" } });

    expect(() => client.live.feed()).toThrow(
      expect.objectContaining({ code: "PROXY_PATH_INVALID" }),
    );
  });
});
