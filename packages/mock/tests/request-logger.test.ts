/**
 * The mock server's request log: one plain line per request — method, path,
 * status, duration — with no escape codes of its own, so a pipe or a log
 * file gets clean text and NO_COLOR is honoured.
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRequestLogger } from "../src/server/request-logger";

beforeEach(() => {
  vi.stubEnv("FORCE_COLOR", undefined);
  vi.stubEnv("COURIER_LOG_LEVEL", undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function app(mode: "normal" | "verbose"): Hono {
  const hono = new Hono();
  hono.use("*", createRequestLogger(mode));
  hono.get("/users", (c) => c.json([], 404));
  hono.get("/__admin/health", (c) => c.json({ ok: true }));
  return hono;
}

describe("the request log", () => {
  it("writes a plain line, with no escape codes, into a pipe", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await app("normal").request("/users");

    const line = String(info.mock.calls[0]?.[1]);
    expect(line).toMatch(/GET \/users → 404 \(\d+ms\)$/);
    expect(line).not.toContain("\x1b[");
  });

  it("leaves out the admin API unless verbose", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await app("normal").request("/__admin/health");
    await app("verbose").request("/__admin/health");

    expect(info).toHaveBeenCalledTimes(1);
  });
});
