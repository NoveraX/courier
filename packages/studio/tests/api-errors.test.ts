/**
 * An API request Studio cannot read is answered with JSON — never with
 * Express's HTML error page, which carries the stack and the absolute paths
 * of the machine Studio runs on.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { MAX_MESSAGE_BYTES } from "../src/server/max-message-bytes";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "courier-api-errors-"));
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "courier.config.ts"), 'export default { sources: { api: { baseURL: "https://api.example" } } };\n');
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

async function post(url: string, body: string) {
  const response = await fetch(`${url}/api/apis/parse`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body,
  });
  return { status: response.status, type: response.headers.get("content-type") ?? "", text: await response.text() };
}

describe("API errors", () => {
  it("answers a body that is not JSON with a JSON 400 and no stack", async () => {
    const url = await start();

    const reply = await post(url, "{");

    expect(reply.status).toBe(400);
    expect(reply.type).toContain("application/json");
    expect(JSON.parse(reply.text)).toEqual({ error: "The request body is not valid JSON." });
    expect(reply.text).not.toContain("node_modules");
  });

  it("answers a body over the limit with a JSON 413", async () => {
    const url = await start();

    const reply = await post(url, JSON.stringify({ content: "x".repeat(MAX_MESSAGE_BYTES) }));

    expect(reply.status).toBe(413);
    expect(JSON.parse(reply.text)).toEqual({ error: "The request body is larger than Studio accepts." });
  });
});

describe("an API route Studio does not have", () => {
  it.each([
    ["GET", "/api/nonexistent"],
    ["GET", "/api/apis/write"],
    ["POST", "/api/nonexistent"],
    ["PUT", "/api/apis/write"],
    /* Routes no Studio page calls, gone: merge answered "safe" for a file it could not read, and dropped every endpoint. */
    ["POST", "/api/apis/merge"],
    ["POST", "/api/apis/fingerprint"],
  ])("is answered to %s %s with a JSON 404, not a page", async (method, path) => {
    const url = await start();

    const response = await fetch(`${url}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: url },
      ...(method !== "GET" && { body: "{}" }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: `Studio has no API route ${method} ${path}` });
  });

  it("does not name the framework Studio runs on", async () => {
    const url = await start();

    const response = await fetch(`${url}/api/health`, { headers: { origin: url } });

    expect(response.headers.get("x-powered-by")).toBeNull();
  });
});
