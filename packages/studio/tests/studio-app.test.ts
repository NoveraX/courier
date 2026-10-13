/**
 * Studio's app routes a request to a route only by the one path the route
 * names: Express on its own takes any case and a trailing slash, which let
 * a writing route be reached by a spelling the token guard did not know.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { studioApp } from "../src/server/studio-app";

let server: Server | undefined;
let base = "";

beforeEach(async () => {
  const app = studioApp();
  app.post("/api/sessions/save", (_req, res) => {
    res.json({ saved: true });
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

async function status(path: string): Promise<number> {
  return (await fetch(`${base}${path}`, { method: "POST" })).status;
}

describe("studioApp", () => {
  it("routes the path a route names", async () => {
    expect(await status("/api/sessions/save")).toBe(200);
  });

  it.each([
    "/api/sessions/save/",
    "/API/SESSIONS/SAVE",
    "/api/Sessions/save",
    "/api/sessions/%73ave",
  ])("routes no other spelling of it: %s", async (path) => {
    expect(await status(path)).toBe(404);
  });

  it("names no framework in its answers", async () => {
    const response = await fetch(`${base}/api/sessions/save`, { method: "POST" });

    expect(response.headers.get("x-powered-by")).toBeNull();
  });
});
