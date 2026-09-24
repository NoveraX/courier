/**
 * Importing a specification by URL through Studio's API: a URL Studio
 * refuses is the request's fault (400), a host it could not read is the
 * server's (502), and a readable one is parsed.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;
const servers: Server[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "courier-parse-url-"));
  writeFileSync(join(root, "courier.config.ts"), 'export default { sources: { api: { baseURL: "https://api.example" } } };\n');
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

async function parse(url: string, specUrl: string) {
  const response = await fetch(`${url}/api/apis/parse`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ source: "url", content: specUrl }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("POST /api/apis/parse with a URL", () => {
  it("answers 400 for a private address it refuses", async () => {
    const url = await start();

    const reply = await parse(url, "http://[::ffff:169.254.169.254]/latest/meta-data");

    expect(reply.status).toBe(400);
    expect(String(reply.body.error)).toContain("Blocked request to private address");
  });

  it("answers 502 for a host it could not reach", async () => {
    const url = await start();

    const reply = await parse(url, "http://127.0.0.1:9/spec.json");

    expect(reply.status).toBe(502);
    expect(String(reply.body.error)).toContain("could not be reached");
  });

  it("parses a specification served on this machine", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ openapi: "3.1.0", info: { title: "Probe", version: "1" }, paths: {} }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const url = await start();

    const reply = await parse(url, `http://127.0.0.1:${(server.address() as { port: number }).port}/openapi.json`);

    expect(reply.status).toBe(200);
  });
});
