/**
 * Serving the built Studio UI: every page of the single-page app, wherever
 * the package is installed. A package manager may install it under a folder
 * whose name starts with a dot — pnpm's `node_modules/.pnpm`, npx's
 * `~/.npm/_npx`, a version manager's `~/.nvm` — and a reload of any page but
 * the first then answered 404.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { serveStudioUi } from "../src/server/serve-ui";

const INDEX = "<!doctype html><title>Studio</title>";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A built UI under `segments`, inside a fresh temporary directory. */
function builtUi(...segments: string[]): string {
  const base = mkdtempSync(join(tmpdir(), "courier-serve-ui-"));
  cleanups.push(() => rmSync(base, { recursive: true, force: true }));
  const dist = join(base, ...segments);
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), INDEX);
  writeFileSync(join(dist, "assets", "app-1a2b3c.js"), "export {};\n");
  return dist;
}

async function serve(dist: string): Promise<string> {
  const app = express();
  serveStudioUi(app, dist);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("not listening on TCP");
  return `http://127.0.0.1:${address.port}`;
}

async function get(url: string) {
  const response = await fetch(url);
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    text: await response.text(),
  };
}

describe("serveStudioUi installed under a folder whose name starts with a dot", () => {
  const dist = () =>
    builtUi("node_modules", ".pnpm", "@noverax+courier-studio@1.0.0", "ui", "dist");

  it.each(["/timeline", "/apis", "/playground", "/settings/sessions"])(
    "answers %s with the app",
    async (path) => {
      const url = await serve(dist());

      const reply = await get(`${url}${path}`);

      expect(reply.status).toBe(200);
      expect(reply.type).toContain("text/html");
      expect(reply.text).toBe(INDEX);
    },
  );

  it("serves the hashed assets", async () => {
    const url = await serve(dist());

    const reply = await get(`${url}/assets/app-1a2b3c.js`);

    expect(reply.status).toBe(200);
    expect(reply.text).toBe("export {};\n");
  });
});

describe("an asset the build does not have", () => {
  it("is answered 404, uncached, not with the app", async () => {
    const url = await serve(builtUi("node_modules", "@noverax", "courier-studio", "ui", "dist"));

    const response = await fetch(`${url}/assets/app-0000000.js`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type") ?? "").not.toContain("text/html");
    expect(response.headers.get("cache-control") ?? "").not.toContain("immutable");
  });
});

describe("serveStudioUi in a plain install", () => {
  it("answers a page with the app", async () => {
    const url = await serve(builtUi("node_modules", "@noverax", "courier-studio", "ui", "dist"));

    const reply = await get(`${url}/timeline`);

    expect(reply.status).toBe(200);
    expect(reply.text).toBe(INDEX);
  });
});
