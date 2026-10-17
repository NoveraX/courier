/**
 * Learning the app's origin from the requests it serves.
 *
 * The Playground sends its calls, their headers and bodies to this origin,
 * so a request teaches it only when it proves it names this very server:
 * its own `Host` is `localhost`, `127.0.0.1` or `[::1]`, on the port the
 * server accepted it on, and it came from this machine — each as far as
 * the adapter can tell, and nothing when it can tell neither. Adapters keep
 * trying until a request qualifies.
 */
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addressedOf } from "../src/adapter/addressed-request";
import { rememberPeerAddress } from "../src/adapter/peer-address";
import { rememberServerPort } from "../src/adapter/server-port";
import {
  adoptListenOrigin,
  configuredAppOrigin,
  getAppOrigin,
  getAppOriginParsed,
  setAppOrigin,
} from "../src/app-origin";
import { discoverAppOrigin } from "../src/discover-app-origin";
import { addressedNodeRequest, discoverNodeAppOrigin } from "../src/node";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  setAppOrigin(undefined);
  vi.unstubAllEnvs();
});

function nodeRequest(
  headers: Record<string, string>,
  socket: { remoteAddress?: string; localPort?: number } = {},
): IncomingMessage {
  return {
    headers,
    socket: { encrypted: false, remoteAddress: "127.0.0.1", localPort: 3000, ...socket },
  } as unknown as IncomingMessage;
}

const sent = (host: string, facts: { serverPort?: number; peer?: string }) => ({
  url: `http://${host}/api/request`,
  host,
  ...facts,
});

describe("discoverAppOrigin", () => {
  it("learns this machine's names on the server's own port, from this machine", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      setAppOrigin(undefined);
      discoverAppOrigin(sent(host, { serverPort: 3000, peer: "::1" }));

      expect(getAppOrigin()).toBe(`http://${host}`);
    }
  });

  it("learns nothing from a Host on another port of this machine", () => {
    discoverAppOrigin(sent("localhost:7990", { serverPort: 3000, peer: "127.0.0.1" }));
    discoverAppOrigin(sent("127.0.0.1", { serverPort: 3000, peer: "127.0.0.1" }));

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns nothing from a request another machine sent, whatever it names", () => {
    for (const peer of ["192.168.1.20", "203.0.113.9", "::ffff:10.0.0.5", "fe80::1"]) {
      discoverAppOrigin(sent("localhost:3000", { serverPort: 3000, peer }));
    }

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns no name another machine, or another loopback address, could answer for", () => {
    for (const host of [
      "evil.example:3000",
      "0.0.0.0:3000",
      "192.168.1.20:3000",
      "app.localhost:3000",
      "127.0.0.2:3000",
      "localhost.evil.example:3000",
    ]) {
      discoverAppOrigin(sent(host, { serverPort: 3000, peer: "127.0.0.1" }));
    }

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns nothing when the adapter can tell neither the port nor where the request came from", () => {
    discoverAppOrigin(sent("localhost:3000", {}));

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns on the port alone, where the adapter cannot tell where the request came from", () => {
    discoverAppOrigin(sent("127.0.0.1:3000", { serverPort: 3000 }));

    expect(getAppOrigin()).toBe("http://127.0.0.1:3000");
  });

  it("learns from this machine alone, where the adapter cannot tell the port", () => {
    discoverAppOrigin(sent("[::1]:5173", { peer: "::ffff:127.0.0.1" }));

    expect(getAppOrigin()).toBe("http://[::1]:5173");
  });

  it("builds the origin from the request's own Host, keeping only the scheme it was seen by", () => {
    discoverAppOrigin({
      url: "https://localhost:3000/api/request",
      host: "127.0.0.1:3000",
      serverPort: 3000,
    });

    expect(getAppOrigin()).toBe("https://127.0.0.1:3000");
  });

  it("reads a Host without a port as the scheme's own port", () => {
    discoverAppOrigin(sent("localhost", { serverPort: 80 }));

    expect(getAppOrigin()).toBe("http://localhost");
  });

  it("learns nothing without a Host, a scheme it knows, or from a malformed one", () => {
    discoverAppOrigin({ url: "http://localhost:3000/", host: undefined, serverPort: 3000 });
    discoverAppOrigin({ url: undefined, host: "localhost:3000", serverPort: 3000 });
    discoverAppOrigin({ url: "ftp://localhost:3000/", host: "localhost:3000", serverPort: 3000 });
    discoverAppOrigin({ url: "http://x/", host: "localhost:3000:1", serverPort: 3000 });

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns a later request that qualifies after ones that did not", () => {
    discoverAppOrigin(sent("localhost:7990", { serverPort: 3000, peer: "127.0.0.1" }));
    discoverAppOrigin(sent("LOCALHOST:3000", { serverPort: 3000, peer: "127.0.0.1" }));

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("keeps the origin that was configured, and takes none in production", () => {
    setAppOrigin("https://configured.example");
    discoverAppOrigin(sent("localhost:3000", { serverPort: 3000 }));
    expect(getAppOrigin()).toBe("https://configured.example");

    setAppOrigin(undefined);
    vi.stubEnv("NODE_ENV", "production");
    discoverAppOrigin(sent("localhost:3000", { serverPort: 3000, peer: "127.0.0.1" }));
    expect(getAppOrigin()).toBeUndefined();
  });
});

describe("what a request tells", () => {
  it("from a Node request: its Host, its socket's local port and peer address", () => {
    expect(
      addressedNodeRequest(nodeRequest({ host: "localhost:3000" }, { remoteAddress: "::1" })),
    ).toEqual({
      url: "http://localhost:3000",
      host: "localhost:3000",
      serverPort: 3000,
      peer: "::1",
    });
  });

  it("from a web request: its Host, and the port and peer an adapter recorded", () => {
    const request = new Request("http://localhost:4321/api/request", {
      headers: { host: "localhost:4321" },
    });
    rememberPeerAddress(request, "127.0.0.1");
    rememberServerPort(request, 4321);

    expect(addressedOf(request)).toEqual({
      url: "http://localhost:4321/api/request",
      host: "localhost:4321",
      serverPort: 4321,
      peer: "127.0.0.1",
    });
    expect(addressedOf(new Request("http://localhost/"), 8080).serverPort).toBe(8080);
  });
});

describe("discoverNodeAppOrigin", () => {
  it("learns this server's origin from a request sent to it from this machine", () => {
    discoverNodeAppOrigin(nodeRequest({}));
    discoverNodeAppOrigin(nodeRequest({ host: "localhost:3000" }));

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("learns nothing an X-Forwarded-Host names, nor a Host on another port", () => {
    discoverNodeAppOrigin(
      nodeRequest({ host: "localhost:7990", "x-forwarded-host": "localhost:3000" }),
    );
    discoverNodeAppOrigin(
      nodeRequest({ host: "evil.example", "x-forwarded-host": "localhost:3000" }),
    );

    expect(getAppOrigin()).toBeUndefined();
  });

  it("learns nothing from a request off the network, though it names this server", () => {
    discoverNodeAppOrigin(
      nodeRequest({ host: "localhost:3000" }, { remoteAddress: "192.168.1.20" }),
    );

    expect(getAppOrigin()).toBeUndefined();
  });
});

describe("the origin's standing", () => {
  it("is not configured when a request taught it", () => {
    discoverAppOrigin(sent("localhost:3000", { serverPort: 3000 }));

    expect(getAppOrigin()).toBe("http://localhost:3000");
    expect(configuredAppOrigin()).toBeUndefined();
  });

  it("is configured when set, or adopted from the address a server listens on", () => {
    setAppOrigin("https://shop.example");
    expect(configuredAppOrigin()).toBe("https://shop.example");

    setAppOrigin(undefined);
    adoptListenOrigin("http://192.168.1.20:3001");
    expect(configuredAppOrigin()).toBe("http://192.168.1.20:3001");
  });

  it("is not adopted from a server's address over one already set, nor in production", () => {
    setAppOrigin("https://shop.example");
    adoptListenOrigin("http://127.0.0.1:3001");
    expect(getAppOrigin()).toBe("https://shop.example");

    setAppOrigin(undefined);
    vi.stubEnv("NODE_ENV", "production");
    adoptListenOrigin("http://127.0.0.1:3001");
    expect(getAppOrigin()).toBeUndefined();
  });
});

describe("APP_ORIGIN_NOT_CONFIGURED", () => {
  it("says when the origin is learned, and to set it everywhere else", () => {
    expect(() => getAppOriginParsed()).toThrow(
      /localhost, 127\.0\.0\.1 or \[::1\] on the port the server accepted it on,\s+sent from this machine/,
    );
    expect(() => getAppOriginParsed()).toThrow(/COURIER_APP_URL/);
    expect(() => getAppOriginParsed()).toThrow(
      /in Docker, on a \*\.localhost name or a network address/,
    );
  });
});
