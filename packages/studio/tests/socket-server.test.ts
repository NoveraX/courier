/**
 * Who Studio's sockets admit, request by request.
 *
 * Engine.IO polling opens with a same-origin GET, which a browser sends
 * without an Origin, so each request of a session is checked, not only the
 * handshake: the POSTs that follow name the page's origin, and a page on a
 * domain rebound to 127.0.0.1 cannot join the UI namespace — where it would
 * watch every captured request and drive the playground — or upgrade the
 * session it opened.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;
let port: number;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-socket-server-")));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
  const url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
  port = Number(new URL(url).port);
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

interface Reply {
  status: number;
  body: string;
}

/* One Engine.IO request as a browser page at `host` sends it: a GET without an Origin, a POST with one. */
function engine(
  host: string,
  method: "GET" | "POST",
  query: string,
  body?: string,
): Promise<Reply> {
  const headers: Record<string, string> = { host };
  if (method === "POST") {
    headers.origin = `http://${host}`;
    headers["content-type"] = "text/plain;charset=UTF-8";
  }
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: `/socket.io/?EIO=4&transport=polling&${query}`,
        headers,
        setHost: false,
      },
      (res) => {
        let text = "";
        res.on("data", (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

/* Handshake, join the UI namespace, and read what Studio answers. */
async function joinUi(host: string): Promise<{ joined: Reply; polled: string }> {
  const handshake = await engine(host, "GET", "t=1");
  expect(handshake.status).toBe(200);
  const { sid } = JSON.parse(handshake.body.slice(1));
  const joined = await engine(host, "POST", `sid=${sid}`, "40/ui,");
  const polled = joined.status === 200 ? (await engine(host, "GET", `sid=${sid}`)).body : "";
  return { joined, polled };
}

/* Upgrade a polling session to a WebSocket, as a browser page at `host` asks: with its Origin. */
function upgrade(host: string, sid: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path: `/socket.io/?EIO=4&transport=websocket&sid=${sid}`,
      setHost: false,
      headers: {
        host,
        origin: `http://${host}`,
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      },
    });
    req.on("upgrade", (_res, socket) => {
      socket.destroy();
      resolve(101);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

describe("a page on a domain rebound to this machine", () => {
  it("cannot join the UI namespace over polling", async () => {
    const { joined, polled } = await joinUi(`evil.example:${port}`);

    expect(joined.status).not.toBe(200);
    expect(polled).not.toContain("40/ui");
  });

  it("cannot upgrade the session it opened to a WebSocket", async () => {
    const handshake = await engine(`evil.example:${port}`, "GET", "t=1");
    const { sid } = JSON.parse(handshake.body.slice(1));

    expect(await upgrade(`evil.example:${port}`, sid)).not.toBe(101);
  });
});

describe("Studio's own page", () => {
  it("joins the UI namespace over polling", async () => {
    const { joined, polled } = await joinUi(`127.0.0.1:${port}`);

    expect(joined.status).toBe(200);
    expect(polled).toContain("40/ui");
  });
});
