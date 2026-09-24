/**
 * The mock wizard's edit of courier.mocks.ts, end to end on a real Studio:
 * the preview right after start, the apply that creates the file and starts
 * the mock, an edit of an existing file, a save between preview and apply,
 * callers the routes refuse, and a project without the mock package.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

const CACHE = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");

const API =
  'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
  "const { endpoint } = courier();\n" +
  'const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<{ id: number }[]>() } });\n' +
  'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n';

const CONFIG = 'import { api } from "./src/api";\n\nexport default { sources: { api } };\n';

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

function project(base = CACHE): string {
  mkdirSync(base, { recursive: true });
  root = realpathSync(mkdtempSync(join(base, "declare ")));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "api.ts"), API);
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
  return root;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function start(projectRoot: string): Promise<string> {
  const mockBasePort = await freePort();
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot, mockBasePort, onReady: resolve, onError: reject });
  });
}

async function post(url: string, path: string, body: unknown, origin: string | null = url) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  const response = await fetch(`${url}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/* Studio loads the config in the background after it listens. */
async function previewOnceLoaded(url: string, mocks: unknown[]) {
  for (let waited = 0; waited < 10_000; waited += 100) {
    const reply = await post(url, "/api/mocks/declare/preview", { mocks });
    const reasons = reply.body.reasons as Array<{ code: string }> | undefined;
    if (reasons?.[0]?.code !== "STUDIO_STARTING" && reasons?.[0]?.code !== "NO_CONFIG") return reply;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Studio never loaded the config");
}

function declaration(key: string, port: number | null, autoStart = false) {
  return { key, source: "api", port, seedCount: 20, autoStart };
}

describe("adding mocks through Studio", () => {
  it("creates courier.mocks.ts from a preview, and the mock it declares starts", async () => {
    const url = await start(project());
    const mockPort = await freePort();

    const preview = await previewOnceLoaded(url, [declaration("apiMock", mockPort, true)]);
    expect(preview.body).toMatchObject({ status: "ready", target: "courier.mocks.ts", creates: true, baseHash: null });

    const applied = await post(url, "/api/mocks/declare/apply", {
      mocks: [declaration("apiMock", mockPort, true)],
      baseHash: null,
      planDigest: preview.body.planDigest,
    });

    expect(applied.body).toEqual({ status: "applied", target: "courier.mocks.ts", keys: ["apiMock"], warnings: [] });
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(
      'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
        'import courierConfig from "./courier.config";\n\n' +
        "export default defineMocks({\n" +
        "  apiMock: defineMockServer({\n" +
        "    source: courierConfig.sources.api,\n" +
        `    port: ${mockPort},\n` +
        "    autoStart: true,\n" +
        "  }),\n" +
        "});\n",
    );
    await vi.waitFor(async () => expect((await fetch(`http://127.0.0.1:${mockPort}/users`)).status).toBe(200), {
      timeout: 15_000,
    });
  }, 40_000);

  it("adds a mock to an existing courier.mocks.ts as a pure insertion", async () => {
    project();
    const existing =
      'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
      'import config from "./courier.config";\n\n' +
      "// the team's mocks\n" +
      "export default defineMocks({\n" +
      "  first: defineMockServer({ source: config.sources.api }),\n" +
      "});\n";
    writeFileSync(join(root, "courier.mocks.ts"), existing);
    const url = await start(root);

    const preview = await previewOnceLoaded(url, [declaration("second", null)]);
    expect(preview.body).toMatchObject({ status: "ready", creates: false });
    const applied = await post(url, "/api/mocks/declare/apply", {
      mocks: [declaration("second", null)],
      baseHash: preview.body.baseHash,
      planDigest: preview.body.planDigest,
    });

    expect(applied.body).toMatchObject({ status: "applied", keys: ["second"] });
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(
      existing.replace("});\n", "  second: defineMockServer({ source: config.sources.api }),\n});\n"),
    );
  }, 40_000);

  it("reports a save made between the preview and the apply, and keeps the developer's file", async () => {
    project();
    writeFileSync(join(root, "courier.mocks.ts"), 'import { defineMocks } from "@noverax/courier-mock";\nexport default defineMocks({});\n');
    const url = await start(root);
    const preview = await previewOnceLoaded(url, [declaration("apiMock", null)]);
    const saved = 'import { defineMocks } from "@noverax/courier-mock";\n// saved meanwhile\nexport default defineMocks({});\n';
    writeFileSync(join(root, "courier.mocks.ts"), saved);

    const applied = await post(url, "/api/mocks/declare/apply", {
      mocks: [declaration("apiMock", null)],
      baseHash: preview.body.baseHash,
      planDigest: preview.body.planDigest,
    });

    expect(applied.body.status).toBe("stale");
    expect((applied.body.plan as { status: string }).status).toBe("ready");
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(saved);
  }, 40_000);

  it("refuses a page on another site, and a caller that sends no origin", async () => {
    const url = await start(project());
    const mocks = [declaration("apiMock", null)];

    const foreign = await post(url, "/api/mocks/declare/preview", { mocks }, "https://evil.example");
    const noOrigin = await post(url, "/api/mocks/declare/preview", { mocks }, null);

    expect(foreign.status).toBe(403);
    expect(noOrigin.status).toBe(403);
    expect(existsSync(join(root, "courier.mocks.ts"))).toBe(false);
  }, 20_000);

  it("answers a malformed request with 400", async () => {
    const url = await start(project());

    const reply = await post(url, "/api/mocks/declare/preview", { mocks: [{ key: "a" }] });

    expect(reply.status).toBe(400);
  }, 20_000);

  it("leaves the edit to the developer when the mock package cannot be loaded, before writing anything", async () => {
    mkdirSync(tmpdir(), { recursive: true });
    root = realpathSync(mkdtempSync(join(tmpdir(), "declare-no-package-")));
    writeFileSync(join(root, "courier.config.ts"), 'export default { sources: { api: { baseURL: "https://api.example" } } };\n');
    const url = await start(root);

    const preview = await previewOnceLoaded(url, [declaration("apiMock", null)]);

    expect(preview.body).toMatchObject({ status: "manual", creates: true, reasons: [{ code: "MOCK_PACKAGE_UNLOADABLE" }] });
    expect(String(preview.body.snippet)).toContain("defineMockServer({ source: courierConfig.sources.api })");
    expect(existsSync(join(root, "courier.mocks.ts"))).toBe(false);
  }, 20_000);
});
