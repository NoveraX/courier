/**
 * Importing a specification by URL through Studio's API: a URL Studio
 * refuses is the request's fault (400); a host it could not read is the
 * server's (502), whether it could not be reached or answered with a body
 * or a redirect Studio cannot use; and a readable one is parsed. A caller
 * without the project's token — a peer on the network Studio was bound to,
 * say — has Studio reach the public internet only, and read no file.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

/* The name servers as these tests answer them: each name its addresses, or none. */
const publicNames = vi.hoisted(() => new Map<string, string[]>());

vi.mock("../src/server/public-resolver", () => ({
  publicResolver: () => ({
    resolve4: async (hostname: string) => {
      const addresses = publicNames.get(hostname);
      if (addresses === undefined) {
        throw Object.assign(new Error(`queryA ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
      }
      return addresses;
    },
    resolve6: async () => {
      throw Object.assign(new Error("queryAaaa ENODATA"), { code: "ENODATA" });
    },
    cancel: () => {},
  }),
}));

let root: string;
let studio: StudioServer | undefined;
const servers: Server[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "courier-parse-url-"));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function parse(
  url: string,
  specUrl: string,
  { source = "url", token = true }: { source?: "url" | "file"; token?: boolean } = {},
) {
  const response = await fetch(`${url}/api/apis/parse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: url,
      ...(token && tokenHeader(studio)),
    },
    body: JSON.stringify({ source, content: specUrl }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/* A service on this machine that counts every request it is sent. */
async function localService(): Promise<{ url: string; hits: () => number }> {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ openapi: "3.1.0", info: { title: "Local", version: "1" }, paths: {} }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/openapi.json`, hits: () => hits };
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

  it.each([
    {
      label: "a body cut off",
      path: "/cut.json",
      reason: "closed the connection before the whole specification arrived (ECONNRESET).",
    },
    {
      label: "a gzip body cut off",
      path: "/cut-gzip.json",
      reason: "closed the connection before the whole specification arrived (ECONNRESET).",
    },
    {
      label: "a plain body labelled gzip",
      path: "/plain-labelled-gzip.json",
      reason: "sent a gzip body that does not decompress (incorrect header check).",
    },
    {
      label: "a redirect to something that is not a URL",
      path: "/redirect-nowhere",
      reason: 'redirects to "http://[", which is not a URL.',
    },
    {
      label: "a redirect to ftp://",
      path: "/redirect-ftp",
      reason:
        "redirects to ftp://docs.example.com/spec.json, which is not an http:// or https:// URL, so Studio does not follow it.",
    },
  ])("answers 502 naming the URL for $label", async ({ path, reason }) => {
    const server = createServer((req, res) => {
      if (req.url === "/redirect-nowhere") res.writeHead(302, { location: "http://[" }).end();
      else if (req.url === "/redirect-ftp")
        res.writeHead(302, { location: "ftp://docs.example.com/spec.json" }).end();
      else if (req.url === "/plain-labelled-gzip.json")
        res.writeHead(200, { "content-encoding": "gzip" }).end('{"openapi":"3.1.0"}');
      else {
        res.writeHead(200, {
          "content-length": "4096",
          ...(req.url === "/cut-gzip.json" ? { "content-encoding": "gzip" } : {}),
        });
        res.write(
          req.url === "/cut-gzip.json" ? gzipSync("x".repeat(4096)).subarray(0, 20) : '{"openapi":',
          () => res.socket?.destroy(),
        );
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const specUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}${path}`;
    const url = await start();

    const reply = await parse(url, specUrl);

    expect(reply).toEqual({ status: 502, body: { error: `${specUrl} ${reason}` } });
  });

  it("parses a specification served on this machine", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ openapi: "3.1.0", info: { title: "Probe", version: "1" }, paths: {} }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const url = await start();

    const reply = await parse(
      url,
      `http://127.0.0.1:${(server.address() as { port: number }).port}/openapi.json`,
    );

    expect(reply.status).toBe(200);
  });
});

describe("POST /api/apis/parse for a URL that answers with nothing", () => {
  it("answers 400 saying the specification is empty", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const specUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/spec.json`;
    const url = await start();

    const reply = await parse(url, specUrl);

    expect(reply.status).toBe(400);
    expect(String(reply.body.error)).toMatch(/empty/i);
  });
});

describe("POST /api/apis/parse for a caller without the token", () => {
  it("never has Studio reach a service on this machine", async () => {
    const service = await localService();
    const url = await start();

    const reply = await parse(url, service.url, { token: false });

    expect(reply.status).toBe(400);
    expect(String(reply.body.error)).toContain("Blocked request to 127.0.0.1");
    expect(String(reply.body.error)).toContain("carries this project's token");
    expect(service.hits()).toBe(0);
  });

  it("is told the same of a closed port as of an open one", async () => {
    const service = await localService();
    const url = await start();
    const open = await parse(url, service.url, { token: false });

    const closed = await parse(url, "http://127.0.0.1:9/openapi.json", { token: false });

    expect(closed).toEqual(open);
  });

  it("is told the same of a name that does not resolve as of one that resolves into the network", async () => {
    publicNames.set("intranet.test", ["10.0.0.7"]);
    const url = await start();

    const inside = await parse(url, "http://intranet.test/openapi.json", { token: false });
    const missing = await parse(url, "http://nowhere.test/openapi.json", { token: false });

    expect(inside.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(String(inside.body.error)).not.toContain("10.0.0.7");
    expect(String(missing.body.error).replace("nowhere.test", "intranet.test")).toBe(
      inside.body.error,
    );
    publicNames.clear();
  });

  it("never has Studio reach a private address either", async () => {
    const url = await start();

    const reply = await parse(url, "http://10.0.0.7/openapi.json", { token: false });

    expect(reply.status).toBe(400);
    expect(String(reply.body.error)).toContain("Blocked request to 10.0.0.7");
  });

  it("has Studio read no file of the project, and is told nothing of whether it is there", async () => {
    mkdirSync(join(root, "specs"));
    writeFileSync(
      join(root, "specs", "internal.yaml"),
      "openapi: 3.0.0\ninfo:\n  title: Internal\n  version: '1'\npaths: {}\n",
    );
    const url = await start();

    const there = await parse(url, "specs/internal.yaml", { source: "file", token: false });
    const missing = await parse(url, "specs/missing.yaml", { source: "file", token: false });
    const outside = await parse(url, "../../etc/passwd", { source: "file", token: false });

    expect(there.status).toBe(401);
    expect(there.body.code).toBe("STUDIO_TOKEN_REQUIRED");
    expect(missing).toEqual(there);
    expect(outside).toEqual(there);
  });

  it("reads a service on this machine for a caller with the token", async () => {
    const service = await localService();
    const url = await start();

    const reply = await parse(url, service.url);

    expect(reply.status).toBe(200);
    expect(reply.body.title).toBe("Local");
    expect(service.hits()).toBe(1);
  });

  it("reads a file of the project for a caller with the token", async () => {
    mkdirSync(join(root, "specs"));
    writeFileSync(
      join(root, "specs", "internal.yaml"),
      "openapi: 3.0.0\ninfo:\n  title: Internal\n  version: '1'\npaths: {}\n",
    );
    const url = await start();

    const reply = await parse(url, "specs/internal.yaml", { source: "file" });

    expect(reply.status).toBe(200);
    expect(reply.body.title).toBe("Internal");
  });
});

describe("POST /api/apis/parse for a caller that goes away", () => {
  it("stops fetching: the host sees its connection closed", async () => {
    let open = 0;
    const host = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
    });
    host.on("connection", (socket) => {
      open++;
      socket.on("close", () => open--);
    });
    await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
    servers.push(host);
    const url = await start();
    const { port } = new URL(url);
    const specUrl = `http://127.0.0.1:${(host.address() as { port: number }).port}/spec.json`;

    const asking = request({
      host: "127.0.0.1",
      port,
      path: "/api/apis/parse",
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: url,
        [TOKEN_HEADER]: studio?.token ?? "",
      },
    });
    asking.on("error", () => {});
    asking.end(JSON.stringify({ source: "url", content: specUrl }));
    await vi.waitUntil(() => open === 1, { timeout: 2_000 });
    asking.destroy();

    await vi.waitUntil(() => open === 0, { timeout: 2_000 });
    expect(open).toBe(0);
  });
});
