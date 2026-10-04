/**
 * Studio's page drives the project — it writes files, starts mock servers,
 * sends requests on the developer's behalf — so every answer forbids
 * framing, which would let any site lure a click onto it, and says the type
 * of what it sends is the one it names.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server";
import { securityHeaders } from "../src/server/security-headers";
import { serveStudioUi } from "../src/server/serve-ui";
import type { StudioServer } from "../src/server/types";

let server: StudioServer;
let origin: string;
let root: string;
let ui: Server;
let uiOrigin: string;

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

beforeAll(async () => {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  root = mkdtempSync(join(cache, "project-"));
  const port = await freePort();
  await new Promise<void>((resolve) => {
    server = createStudioServer({
      port,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: () => resolve(),
    });
  });
  origin = `http://127.0.0.1:${port}`;

  /* The UI is built into the package; from the sources it is served from a build like this one. */
  const dist = join(root, "ui-dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Studio</title>");
  writeFileSync(join(dist, "assets", "app-1a2b.js"), "export {};");
  const app = express();
  app.use(securityHeaders);
  serveStudioUi(app, dist);
  ui = createHttpServer(app);
  await new Promise<void>((resolve) => ui.listen(0, "127.0.0.1", resolve));
  uiOrigin = `http://127.0.0.1:${(ui.address() as { port: number }).port}`;
});

afterAll(async () => {
  await server.close();
  await new Promise<void>((resolve) => ui.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});

function expectGuarded(response: Response): void {
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("Studio's API", () => {
  it("forbids framing and sniffing, and sends no referrer on", async () => {
    const response = await fetch(`${origin}/api/health`);

    expect(response.status).toBe(200);
    expectGuarded(response);
  });
});

describe.each(["/", "/timeline", "/assets/app-1a2b.js"])("the UI's answer to %s", (path) => {
  it("forbids framing and sniffing, and sends no referrer on", async () => {
    const response = await fetch(`${uiOrigin}${path}`);

    expect(response.status).toBe(200);
    expectGuarded(response);
  });
});
