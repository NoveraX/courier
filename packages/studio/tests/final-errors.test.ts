/**
 * An error no route answered — a page's address whose escapes do not
 * decode, the page's file gone, a failure past the API — is answered with
 * its status in plain text. Express's own page, which Studio served before,
 * carried the error's stack and the absolute paths in it to any caller,
 * whatever the Host, and printed the stack in the terminal for every such
 * request.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { finalErrors } from "../src/server/final-errors";
import { securityHeaders } from "../src/server/security-headers";
import { serveStudioUi } from "../src/server/serve-ui";
import { studioApp } from "../src/server/studio-app";
import type { StudioServer } from "../src/server/types";

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
}

const cleanups: Array<() => Promise<void> | void> = [];

/* What Studio would print in its terminal, each level held back. */
function terminal() {
  return {
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
  };
}

let printed: ReturnType<typeof terminal>;

beforeEach(() => {
  printed = terminal();
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

function folder(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/* Studio's page as it serves it, a route that fails as a handler can, and the answer to errors last. */
async function page(): Promise<{ base: string; dist: string }> {
  const dist = join(folder("courier-final-errors-"), "ui", "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Studio</title>");
  const app = studioApp();
  app.use(securityHeaders);
  app.get("/fails", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", '"a-file"');
    throw new Error(`could not read ${dist}/index.html`);
  });
  serveStudioUi(app, dist);
  app.use(finalErrors);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, dist };
}

/* Sent as written, with any Host: a name rebound to this machine reads the answer as its own. */
function send(base: string, path: string, method = "GET"): Promise<Answer> {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    const sent = request(
      { host: "127.0.0.1", port, path, method, headers: { host: `rebound.example:${port}` } },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
      },
    );
    sent.on("error", reject);
    sent.end();
  });
}

function nothingPrinted(): void {
  for (const spy of Object.values(printed)) expect(spy).not.toHaveBeenCalled();
}

describe("an address whose escapes do not decode", () => {
  it.each(["/%E0", "/sessions/%E0%A4%A"])(
    "is answered 400 in plain text, with no stack, no path and nothing printed: %s",
    async (path) => {
      const { base, dist } = await page();

      const answer = await send(base, path);

      expect(answer.status).toBe(400);
      expect(answer.headers["content-type"]).toBe("text/plain; charset=utf-8");
      expect(answer.text).toBe("Bad Request\n");
      expect(answer.text).not.toContain(dist);
      expect(answer.text).not.toContain("node_modules");
      nothingPrinted();
    },
  );

  it("is answered with the status alone when only its headers are asked for", async () => {
    const { base } = await page();

    const answer = await send(base, "/%E0", "HEAD");

    expect(answer.status).toBe(400);
    expect(answer.text).toBe("");
    nothingPrinted();
  });
});

describe("the page's file, gone from disk", () => {
  it("is answered 404 in plain text, naming no path", async () => {
    const { base, dist } = await page();
    rmSync(join(dist, "index.html"));

    const answer = await send(base, "/explorer");

    expect(answer.status).toBe(404);
    expect(answer.text).toBe("Not Found\n");
    expect(answer.text).not.toContain(dist);
    nothingPrinted();
  });
});

describe("a handler's own failure", () => {
  it("is answered 500, its message kept to the terminal, and nothing of the file it sent kept", async () => {
    const { base, dist } = await page();

    const answer = await send(base, "/fails");

    expect(answer.status).toBe(500);
    expect(answer.text).toBe("Internal Server Error\n");
    expect(answer.text).not.toContain(dist);
    expect(answer.headers["cache-control"]).toBe("no-store");
    expect(answer.headers.etag).toBeUndefined();
    expect(answer.headers["x-content-type-options"]).toBe("nosniff");
    expect(answer.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(printed.error).toHaveBeenCalledTimes(1);
  });
});

describe("a running Studio", () => {
  let studio: StudioServer | undefined;

  afterEach(async () => {
    await studio?.close();
    studio = undefined;
  });

  async function start(): Promise<string> {
    const root = folder("courier-final-errors-project-");
    writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
    return new Promise((resolve, reject) => {
      studio = createStudioServer({
        port: 0,
        host: "127.0.0.1",
        projectRoot: root,
        onReady: resolve,
        onError: reject,
      });
    });
  }

  it("answers an error a handler outside its API let escape in plain text", async () => {
    const url = await start();

    /* The MCP endpoint, sent a method no Web request takes, throws before it can answer. */
    const answer = await send(url, "/mcp", "TRACE");

    expect(answer.status).toBe(500);
    expect(answer.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(answer.text).toBe("Internal Server Error\n");
  });

  it("keeps the API's own answers to errors in JSON", async () => {
    const url = await start();

    const answer = await fetch(`${url}/api/apis/parse`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: url },
      body: "{",
    });

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: "The request body is not valid JSON." });
  });
});
