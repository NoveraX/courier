/**
 * @vitest-environment node
 */

import diagnostics from "node:diagnostics_channel";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import {
  adoptListenOrigin,
  DEV_SERVER_ORIGIN_ENV,
  NEXT_ORIGIN_ENV,
} from "@noverax/courier/internal";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAnnouncements } from "../../core/src/announce/test-support";
import { _resetRuntimeHandlesForTests, attachRuntime } from "../src/runtime/attach-runtime";

const projects: string[] = [];

afterEach(() => {
  _resetRuntimeHandlesForTests();
  resetAnnouncements();
  vi.restoreAllMocks();
  for (const dir of projects.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("attachRuntime (server context)", () => {
  it("reports kind=server when window is undefined", async () => {
    const handle = await attachRuntime("test-server-1");
    expect(handle.kind).toBe("server");
    expect(handle.runtimeId).toBe("test-server-1");
  });

  it("is idempotent — same id returns the same handle", async () => {
    const a = await attachRuntime("test-server-2");
    const b = await attachRuntime("test-server-2");
    expect(a).toBe(b);
  });

  it("detach drops the handle so a fresh attach reconnects", async () => {
    const first = await attachRuntime("test-server-3");
    first.detach();
    const second = await attachRuntime("test-server-3");
    expect(second).not.toBe(first);
  });

  it("detach is safe to call twice", async () => {
    const handle = await attachRuntime("test-server-4");
    handle.detach();
    expect(() => handle.detach()).not.toThrow();
  });

  it("watches the requests undici writes on Node's diagnostics channel, for their HTTP version", async () => {
    const subscribe = vi.spyOn(diagnostics, "subscribe");

    await attachRuntime("test-server-5");

    expect(subscribe).toHaveBeenCalledWith("undici:client:sendHeaders", expect.any(Function));
  });

  it("auto-derives a default runtime id when none is passed", async () => {
    const handle = await attachRuntime();
    // Default for the vitest node context (no NEXT_RUNTIME etc.) is "server"
    expect(typeof handle.runtimeId).toBe("string");
    expect(handle.runtimeId.length).toBeGreaterThan(0);
    expect(handle.kind).toBe("server");
  });
});

describe("the config a server runtime loaded", () => {
  it("is handed back by its handle, as the project wrote it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "courier-runtime-config-"));
    projects.push(dir);
    writeFileSync(
      join(dir, "courier.config.mjs"),
      'export default { sources: {}, agents: { offer: "reads", deny: ["billing.**"] } };\n',
    );
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    const handle = await attachRuntime("test-config-1");

    expect(handle.config()?.agents).toEqual({ offer: "reads", deny: ["billing.**"] });
  });

  it("is undefined where no config loaded", async () => {
    const dir = mkdtempSync(join(tmpdir(), "courier-runtime-none-"));
    projects.push(dir);
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    const handle = await attachRuntime("test-config-2");

    expect(handle.config()).toBeUndefined();
  });
});

describe("the app's origin a server runtime starts with", () => {
  /* A project whose config names no origin, unless it is given one. */
  function project(appOrigin?: string): void {
    const dir = mkdtempSync(join(tmpdir(), "courier-runtime-origin-"));
    projects.push(dir);
    const runtime =
      appOrigin === undefined ? "" : `, runtime: { appOrigin: ${JSON.stringify(appOrigin)} }`;
    writeFileSync(join(dir, "courier.config.mjs"), `export default { sources: {}${runtime} };\n`);
    vi.spyOn(process, "cwd").mockReturnValue(dir);
  }

  afterEach(() => {
    setAppOrigin(undefined);
    vi.unstubAllEnvs();
  });

  it("keeps the one a dev server's plugin adopted when nothing configures one", async () => {
    vi.stubEnv("NODE_ENV", "development");
    adoptListenOrigin("http://localhost:5173");
    project();

    await attachRuntime("test-origin-1");

    expect(getAppOrigin()).toBe("http://localhost:5173");
  });

  it("takes the config's own over it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    adoptListenOrigin("http://localhost:5173");
    project("http://localhost:3000");

    await attachRuntime("test-origin-2");

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("finds the dev server's address in the environment, as Nitro's worker does", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(DEV_SERVER_ORIGIN_ENV, "http://localhost:3000");
    project();

    await attachRuntime("test-origin-3");

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("finds the address Next.js recorded as its server started, before any request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(NEXT_ORIGIN_ENV, "http://localhost:3116");
    project();

    await attachRuntime("test-origin-4");

    expect(getAppOrigin()).toBe("http://localhost:3116");
  });
});
