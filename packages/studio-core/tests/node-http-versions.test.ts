/**
 * The HTTP versions a Node process's fetch calls go over, as undici reports
 * them while it writes each request: a real call over a plain socket, and a
 * report of one whose TLS socket negotiated HTTP/2.
 */
import diagnostics from "node:diagnostics_channel";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { observeNodeHttpVersions } from "../src/runtime/http-versions/node-http-versions";

let server: Server | undefined;
const disposers: Array<() => void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

function observe(): ReturnType<typeof observeNodeHttpVersions> {
  const versions = observeNodeHttpVersions();
  disposers.push(versions.dispose);
  return versions;
}

describe("observeNodeHttpVersions", () => {
  it("tells HTTP/1.1 for a call that went out on a plain socket", async () => {
    server = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/users`;
    const versions = observe();

    await (await fetch(url)).text();

    expect(versions.versionOf(url)).toBe("HTTP/1.1");
  });

  it("tells the version a TLS socket negotiated", () => {
    const versions = observe();

    diagnostics.channel("undici:client:sendHeaders").publish({
      request: { origin: "https://api.example.com" },
      socket: { alpnProtocol: "h2" },
    });

    expect(versions.versionOf("https://api.example.com/users")).toBe("HTTP/2");
  });

  it("tells nothing once it stops watching", () => {
    const versions = observeNodeHttpVersions();
    versions.dispose();

    diagnostics.channel("undici:client:sendHeaders").publish({
      request: { origin: "https://late.example.com" },
      socket: { alpnProtocol: "h2" },
    });

    expect(versions.versionOf("https://late.example.com/")).toBeUndefined();
  });
});
