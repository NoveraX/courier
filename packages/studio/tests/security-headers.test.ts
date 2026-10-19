/**
 * Studio's page drives the project — it writes files, starts mock servers,
 * sends requests on the developer's behalf — so no site may frame it, which
 * would let it lure a click onto it: only VS Code and the editors built on
 * it, which show Studio in a tab of their own. Every answer says the type
 * of what it sends is the one it names, and that no search engine may index
 * it: Studio is a tool, a public demo of it included.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
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

beforeAll(async () => {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  root = mkdtempSync(join(cache, "project-"));
  /* Port 0: the system picks one as Studio binds it, so no other test can take it in between. */
  origin = await new Promise<string>((resolve) => {
    server = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
    });
  });

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
  const policy = response.headers.get("content-security-policy") ?? "";
  /* Only an editor's own window or webview, which no web page can be, may frame it. */
  expect(policy).toContain("frame-ancestors vscode-webview: vscode-file:");
  /* Only Studio's own scripts run, and nothing loads, calls out or posts a form elsewhere. */
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'none'");
  expect(policy).toContain("form-action 'self'");
  expect(policy).not.toContain("unsafe-eval");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
}

describe("Studio's API", () => {
  it("forbids framing, sniffing and indexing, and sends no referrer on", async () => {
    const response = await fetch(`${origin}/api/health`);

    expect(response.status).toBe(200);
    expectGuarded(response);
  });
});

describe.each(["/", "/timeline", "/assets/app-1a2b.js", "/robots.txt"])(
  "the UI's answer to %s",
  (path) => {
    it("forbids framing, sniffing and indexing, and sends no referrer on", async () => {
      const response = await fetch(`${uiOrigin}${path}`);

      expect(response.status).toBe(200);
      expectGuarded(response);
    });
  },
);

describe("Studio loaded into a frame", () => {
  it("leaves the frame to the policy, which admits only VS Code's windows and webviews", async () => {
    const response = await fetch(`${uiOrigin}/timeline`, {
      headers: { "sec-fetch-dest": "iframe" },
    });
    const policy = response.headers.get("content-security-policy") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(policy).toContain("frame-ancestors vscode-webview: vscode-file:");
    expect(policy).not.toMatch(/frame-ancestors[^;]*(\*|https?:)/);
  });
});
