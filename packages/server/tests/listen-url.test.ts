/**
 * The address a standalone server reports — to `onReady`, in its log, to
 * Studio and as the app's origin — is one a client can dial, and it is
 * announced once: in the server's log, or by `onReady` in its place.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCourierServer } from "../src/create-server";
import { listenUrl } from "../src/listen-url";
import type { CourierServer } from "../src/types";

const { endpoint } = courier();
const sources = {
  api: defineApi({
    baseURL: "http://localhost:9999",
    groups: { test: defineGroup({ prefix: "test", endpoints: { hello: endpoint.get("hello") } }) },
  }),
};

let server: CourierServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
  setAppOrigin(undefined);
  vi.restoreAllMocks();
});

function start(host: string): Promise<string> {
  return new Promise((resolve) => {
    server = createCourierServer({ sources, port: 0, host, signals: false, onReady: resolve });
  });
}

describe("the address a server bound to a host is dialled at", () => {
  it("puts an IPv6 literal in brackets", () => {
    expect(listenUrl("::1", 3001)).toBe("http://[::1]:3001");
    expect(new URL(listenUrl("::1", 3001)).port).toBe("3001");
  });

  it("is loopback for a server bound to every interface", () => {
    expect(listenUrl("0.0.0.0", 3001)).toBe("http://127.0.0.1:3001");
    expect(listenUrl("", 3001)).toBe("http://127.0.0.1:3001");
    expect(listenUrl("::", 3001)).toBe("http://[::1]:3001");
  });

  it("is the host itself otherwise", () => {
    expect(listenUrl("localhost", 3001)).toBe("http://localhost:3001");
  });
});

describe("a standalone server that listens", () => {
  it("reports an address it answers at, bound to every interface", async () => {
    const url = await start("0.0.0.0");

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });

  it("is the app's origin, for Studio's Playground, when nothing named one", async () => {
    setAppOrigin(undefined);

    const url = await start("127.0.0.1");

    expect(getAppOrigin()).toBe(url);
  });

  it("leaves an app origin config or the environment named", async () => {
    setAppOrigin("http://app.test:3000");

    await start("127.0.0.1");

    expect(getAppOrigin()).toBe("http://app.test:3000");
  });
});

describe("announcing the address", () => {
  /** The log lines, among the console calls, that announce the address. */
  function announced(calls: readonly (readonly unknown[])[]): string[] {
    return calls.map((call) => String(call[1])).filter((line) => line.includes("Listening on"));
  }

  it("is the server's own log line when no onReady is given", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    server = createCourierServer({ sources, port: 0, host: "127.0.0.1", signals: false });
    await server.ready;

    expect(info).toHaveBeenCalled();
    expect(announced(info.mock.calls)).toEqual([
      expect.stringContaining(`Listening on ${server.url}`),
    ]);
  });

  it("is left to onReady when one is given, so the address is not said twice", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const url = await start("127.0.0.1");

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(announced(info.mock.calls)).toEqual([]);
  });
});
