/**
 * The project as a running Studio serves it: a UI that connects is sent the
 * imports, the sources and how the config loads, from the load Studio runs
 * and never from a load of its own; a save loads the config once and every
 * UI is told exactly what that load produced; a config that stops loading or
 * is deleted is reported while Studio keeps running what it loaded; the mock
 * wizard tells a missing config from one that does not load; problems at
 * start are kept for the banner; and every outcome is told, even one that
 * cannot be applied, while the reloads after it still run.
 */
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApplyLoadedMocksModule from "../src/server/apply-loaded-mocks";
import type * as StartupIssuesModule from "../src/server/startup-issues";

const issues = vi.hoisted(() => ({ throwNext: false }));
const handover = vi.hoisted(() => ({ throwNext: false }));

vi.mock("../src/server/apply-loaded-mocks", async (importOriginal) => {
  const actual = await importOriginal<typeof ApplyLoadedMocksModule>();
  return {
    ...actual,
    applyLoadedMocks: (...args: Parameters<typeof actual.applyLoadedMocks>) => {
      if (handover.throwNext) {
        handover.throwNext = false;
        throw new Error("the mocks could not be handed over");
      }
      actual.applyLoadedMocks(...args);
    },
  };
});

vi.mock("../src/server/startup-issues", async (importOriginal) => {
  const actual = await importOriginal<typeof StartupIssuesModule>();
  return {
    ...actual,
    recordStartupIssue: (...args: Parameters<typeof actual.recordStartupIssue>) => {
      if (issues.throwNext) {
        issues.throwNext = false;
        throw new Error("the startup issue could not be recorded");
      }
      actual.recordStartupIssue(...args);
    },
  };
});

import { BindingTable } from "../src/server/catalog/binding-table";
import { createStudioServer } from "../src/server/create-studio-server";
import { clearStartupIssues, startupIssues } from "../src/server/startup-issues";

const CACHE = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
const BROKEN = 'import "./src/missing";\nexport default { sources: {} };\n';
const FIXED = 'import { demo } from "./src/demo";\nexport default { sources: { demo } };\n';
const MISSPELLED = 'import { demoo } from "./src/demo";\nexport default { sources: { demo: demoo } };\n';

const cleanups: Array<() => Promise<void> | void> = [];
let fixtures = 0;

beforeEach(() => {
  clearStartupIssues();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  issues.throwNext = false;
  handover.throwNext = false;
  clearStartupIssues();
  vi.restoreAllMocks();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, budgetMs = 6000): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 25) {
    if (condition()) return true;
    await sleep(25);
  }
  return condition();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function counter(key: string): number {
  const value: unknown = Reflect.get(globalThis, key);
  return typeof value === "number" ? value : 0;
}

interface Project {
  root: string;
  config: string;
  demo: string;
  /** How many times courier.config.ts was evaluated. */
  configEvaluations(): number;
  /** How many times src/demo.ts was evaluated; its baseURL carries the count. */
  demoEvaluations(): number;
}

interface ProjectOptions {
  config?: "good" | "slow" | "broken" | "none";
}

/* Under the repository's node_modules, so the fixture resolves the workspace packages. */
function project({ config = "good" }: ProjectOptions = {}): Project {
  mkdirSync(CACHE, { recursive: true });
  const root = realpathSync(mkdtempSync(join(CACHE, "project-state-")));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const key = `__courierProjectState${process.pid}_${++fixtures}`;
  mkdirSync(join(root, "src"));
  const demo = join(root, "src", "demo.ts");
  writeFileSync(
    demo,
    'import { defineApi } from "@noverax/courier/define";\n' +
      "const counts = globalThis as Record<string, number | undefined>;\n" +
      `const evaluation = (counts.${key}_demo ?? 0) + 1;\n` +
      `counts.${key}_demo = evaluation;\n` +
      "export const demo = defineApi({ baseURL: `https://v${evaluation}.example`, endpoints: {} });\n",
  );
  const file = join(root, "courier.config.ts");
  if (config === "broken") writeFileSync(file, BROKEN);
  if (config === "good" || config === "slow") writeFileSync(file, goodConfig(key, config === "slow"));
  return {
    root,
    config: file,
    demo,
    configEvaluations: () => counter(`${key}_config`),
    demoEvaluations: () => counter(`${key}_demo`),
  };
}

function goodConfig(key: string, slow: boolean): string {
  return (
    'import { demo } from "./src/demo";\n' +
    (slow ? "await new Promise((resolve) => setTimeout(resolve, 900));\n" : "") +
    "const counts = globalThis as Record<string, number | undefined>;\n" +
    `counts.${key}_config = (counts.${key}_config ?? 0) + 1;\n` +
    "export default {\n" +
    "  sources: { demo },\n" +
    '  imports: { remote: { importType: "url", type: "openapi", from: "https://specs.example/remote.json", outputDir: "src/gen" } },\n' +
    "};\n"
  );
}

/** Imports state as Studio writes it after importing `name`. */
function writeImportState(root: string, name: string): void {
  mkdirSync(join(root, ".courier"), { recursive: true });
  const entry = {
    specHash: "abc",
    fetchedAt: "2026-09-25T00:00:00.000Z",
    lastSyncedAt: "2026-09-25T00:00:00.000Z",
    userModified: [],
    generatedFiles: [],
    fileFingerprints: {},
  };
  writeFileSync(join(root, ".courier", "imports-state.json"), JSON.stringify({ version: 1, imports: { [name]: entry } }));
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (!isRecord(address) || typeof address.port !== "number") throw new Error("no port");
  return address.port;
}

async function start(root: string): Promise<string> {
  const mockBasePort = await freePort();
  return new Promise<string>((resolve, reject) => {
    const server = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, mockBasePort, onReady: resolve, onError: reject });
    cleanups.push(() => server.close());
  });
}

/** A Studio UI: every event it receives, in order. */
interface Ui {
  events: Array<[string, unknown]>;
}

function ui(url: string): Ui {
  const socket = connect(`${url}/ui`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { Origin: url },
  });
  const events: Array<[string, unknown]> = [];
  socket.onAny((event: string, payload: unknown) => {
    events.push([event, payload]);
  });
  cleanups.push(() => {
    socket.disconnect();
  });
  return { events };
}

function payloads(u: Ui, event: string): unknown[] {
  return u.events.filter(([name]) => name === event).map(([, payload]) => payload);
}

function statuses(u: Ui): Record<string, unknown>[] {
  return payloads(u, "config:status").filter(isRecord);
}

function hasStatus(u: Ui, state: string): boolean {
  return statuses(u).some((status) => status.state === state);
}

function lastStatus(u: Ui, state: string): Record<string, unknown> | undefined {
  return statuses(u)
    .filter((status) => status.state === state)
    .at(-1);
}

function indexOf(u: Ui, event: string, from = 0): number {
  return u.events.findIndex(([name], index) => index >= from && name === event);
}

function sourcesOf(scan: unknown): Record<string, unknown>[] {
  return isRecord(scan) && Array.isArray(scan.sources) ? scan.sources.filter(isRecord) : [];
}

function demoBaseURL(scan: unknown): unknown {
  return sourcesOf(scan).find((source) => source.name === "demo")?.baseURL;
}

function importNames(registry: unknown): unknown[] {
  return sourcesOf(registry).map((source) => source.name);
}

/** A Studio that has made its first load, and a UI that saw it. */
async function loadedStudio(fixture: Project): Promise<{ url: string; first: Ui }> {
  const url = await start(fixture.root);
  const first = ui(url);
  await until(() => fixture.configEvaluations() >= 1 && payloads(first, "scan:sources").length > 0);
  await sleep(200);
  return { url, first };
}

async function preview(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${url}/api/mocks/declare/preview`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ mocks: [{ key: "apiMock", source: "demo", port: null, seedCount: 20, autoStart: false }] }),
  });
  const body: unknown = await response.json();
  return isRecord(body) ? body : {};
}

function reasonCode(outcome: Record<string, unknown>): unknown {
  const [reason] = Array.isArray(outcome.reasons) ? outcome.reasons : [];
  return isRecord(reason) ? reason.code : undefined;
}

describe("a UI that connects", () => {
  it("is sent the imports and the sources, and the config is not evaluated again", async () => {
    const fixture = project();
    const { url } = await loadedStudio(fixture);
    const evaluated = fixture.configEvaluations();

    const second = ui(url);
    await until(() => payloads(second, "scan:sources").length > 0 && payloads(second, "registry:updated").length > 0);
    await sleep(400);

    expect(importNames(payloads(second, "registry:updated").at(-1))).toEqual(["remote"]);
    expect(demoBaseURL(payloads(second, "scan:sources").at(-1))).toBe("https://v1.example");
    expect(fixture.configEvaluations()).toBe(evaluated);
  }, 20_000);

  it("while Studio starts, is sent `starting`, then the first load's lists, and the config is evaluated once", async () => {
    const fixture = project({ config: "slow" });
    const url = await start(fixture.root);

    const early = ui(url);
    await until(() => hasStatus(early, "loaded"), 10_000);
    await sleep(400);

    expect(statuses(early).map((status) => status.state)).toEqual(["starting", "loaded"]);
    expect(payloads(early, "scan:sources")).toHaveLength(1);
    expect(payloads(early, "registry:updated")).toHaveLength(1);
    expect(demoBaseURL(payloads(early, "scan:sources")[0])).toBe("https://v1.example");
    expect(fixture.configEvaluations()).toBe(1);
  }, 20_000);

  it("in a project without courier.config, is told it is missing, with the imports Studio wrote and no sources", async () => {
    const fixture = project({ config: "none" });
    writeImportState(fixture.root, "petstore");
    const url = await start(fixture.root);

    const u = ui(url);
    await until(() => hasStatus(u, "missing"));

    expect(lastStatus(u, "missing")).toEqual({ state: "missing", revision: 1, lastGoodAt: null });
    expect(importNames(payloads(u, "registry:updated").at(-1))).toEqual(["petstore"]);
    expect(payloads(u, "scan:sources").at(-1)).toEqual({ sources: [], scannedFiles: 0 });
  }, 20_000);

  it("after the config stops loading, is told why and still sees what Studio runs", async () => {
    const fixture = project();
    const { url, first } = await loadedStudio(fixture);
    const loadedAt = lastStatus(first, "loaded")?.loadedAt;
    writeFileSync(fixture.config, BROKEN);
    await until(() => hasStatus(first, "failed"));

    const late = ui(url);
    await until(() => hasStatus(late, "failed"));

    const failed = lastStatus(late, "failed");
    expect(failed).toMatchObject({ state: "failed", configFile: "courier.config.ts", lastGoodAt: loadedAt });
    const error = failed?.error;
    expect(isRecord(error) ? error.message : undefined).toEqual(expect.stringContaining("src/missing"));
    expect(demoBaseURL(payloads(late, "scan:sources").at(-1))).toBe("https://v1.example");
    expect(importNames(payloads(late, "registry:updated").at(-1))).toEqual(["remote"]);
  }, 20_000);

  it("is sent the lists before the status, and the status last", async () => {
    const fixture = project();
    const { url } = await loadedStudio(fixture);

    const u = ui(url);
    await until(() => hasStatus(u, "loaded"));

    const status = indexOf(u, "config:status");
    expect(status).toBeGreaterThan(-1);
    expect(indexOf(u, "registry:updated")).toBeLessThan(status);
    expect(indexOf(u, "scan:sources")).toBeLessThan(status);
    expect(indexOf(u, "registry:updated")).toBeGreaterThan(-1);
    expect(indexOf(u, "scan:sources")).toBeGreaterThan(-1);
  }, 20_000);
});

describe("a save", () => {
  it("evaluates the config once, and the sources sent describe that very evaluation", async () => {
    const fixture = project();
    const { first } = await loadedStudio(fixture);
    const evaluated = fixture.demoEvaluations();
    first.events.length = 0;

    appendFileSync(fixture.demo, "// saved\n");
    await until(() => payloads(first, "scan:sources").length > 0);
    await sleep(600);

    expect(fixture.demoEvaluations()).toBe(evaluated + 1);
    expect(demoBaseURL(payloads(first, "scan:sources").at(-1))).toBe(`https://v${evaluated + 1}.example`);
  }, 20_000);

  it("sends the lists, then the status, then a binding snapshot the UI accepts", async () => {
    const fixture = project();
    const { first } = await loadedStudio(fixture);
    first.events.length = 0;

    appendFileSync(fixture.demo, "// saved\n");
    await until(() => payloads(first, "binding:snapshot").length > 0);

    const snapshot = payloads(first, "binding:snapshot").at(-1);
    expect(snapshot).toEqual({ rows: expect.any(Array), runtimeCount: 0, sourceCount: 0 });
    const status = indexOf(first, "config:status");
    expect(status).toBeGreaterThan(indexOf(first, "scan:sources"));
    expect(indexOf(first, "scan:sources")).toBeGreaterThan(indexOf(first, "registry:updated"));
    expect(indexOf(first, "binding:snapshot")).toBeGreaterThan(status);
    expect(indexOf(first, "registry:updated")).toBeGreaterThan(-1);
  }, 20_000);
});

describe("deleting courier.config", () => {
  it("reports it missing with when Studio last loaded it, and keeps the sources Studio runs", async () => {
    const fixture = project();
    const { first } = await loadedStudio(fixture);
    const loadedAt = lastStatus(first, "loaded")?.loadedAt;
    expect(loadedAt).toEqual(expect.any(Number));
    first.events.length = 0;

    unlinkSync(fixture.config);
    await until(() => hasStatus(first, "missing"));

    expect(lastStatus(first, "missing")).toEqual({ state: "missing", revision: 2, lastGoodAt: loadedAt });
    expect(demoBaseURL(payloads(first, "scan:sources").at(-1))).toBe("https://v1.example");
  }, 20_000);
});

describe("the mock wizard", () => {
  it("is told there is no config after courier.config was deleted", async () => {
    const fixture = project();
    const { url, first } = await loadedStudio(fixture);
    unlinkSync(fixture.config);
    await until(() => hasStatus(first, "missing"));

    const outcome = await preview(url);

    expect(outcome).toMatchObject({ status: "manual" });
    expect(reasonCode(outcome)).toBe("NO_CONFIG");
  }, 20_000);

  it("is told the config does not load, not that there is none, when it never loaded", async () => {
    const fixture = project({ config: "broken" });
    const url = await start(fixture.root);

    const outcome = await preview(url);

    expect(outcome).toMatchObject({ status: "manual" });
    expect(reasonCode(outcome)).toBe("CONFIG_LOAD_FAILING");
  }, 20_000);
});

describe("problems at start", () => {
  it("records a config that does not load, for the banner", async () => {
    const fixture = project({ config: "broken" });
    const url = await start(fixture.root);
    const u = ui(url);
    await until(() => hasStatus(u, "failed"));

    expect(startupIssues()).toHaveLength(1);
    expect(startupIssues()[0]).toMatch(/^courier\.config did not load, so no sources are bound: /);
  }, 20_000);

  it("records nothing for a project without courier.config", async () => {
    const fixture = project({ config: "none" });
    const url = await start(fixture.root);
    const u = ui(url);
    await until(() => hasStatus(u, "missing"));

    expect(startupIssues()).toEqual([]);
  }, 20_000);

  it("records a mocks file that does not load, and still serves the config's sources", async () => {
    const fixture = project();
    writeFileSync(join(fixture.root, "courier.mocks.ts"), 'import { missing } from "./missing";\nexport default { missing };\n');
    const { first } = await loadedStudio(fixture);

    expect(startupIssues()).toHaveLength(1);
    expect(startupIssues()[0]).toMatch(/^courier\.mocks\.ts did not load, so no mocks are declared: /);
    expect(demoBaseURL(payloads(first, "scan:sources").at(-1))).toBe("https://v1.example");
  }, 20_000);

  it("records nothing when the mocks file loads", async () => {
    const fixture = project();
    writeFileSync(join(fixture.root, "courier.mocks.ts"), "export default {};\n");
    await loadedStudio(fixture);

    expect(startupIssues()).toEqual([]);
  }, 20_000);
});

describe("a config whose source import is misspelled", () => {
  it("saved over a loaded config, is told to every UI as a failure, and the wizard will not plan against it", async () => {
    const fixture = project();
    const { url, first } = await loadedStudio(fixture);

    writeFileSync(fixture.config, MISSPELLED);
    await until(() => hasStatus(first, "failed"));
    const late = ui(url);
    await until(() => hasStatus(late, "failed"));
    const outcome = await preview(url);

    const invalid = { code: "CONFIG_INVALID", message: expect.stringContaining("courier.config.sources.demo is undefined") };
    expect(lastStatus(first, "failed")).toMatchObject({ state: "failed", error: invalid });
    expect(lastStatus(late, "failed")).toMatchObject({ state: "failed", configFile: "courier.config.ts", error: invalid });
    expect(demoBaseURL(payloads(late, "scan:sources").at(-1))).toBe("https://v1.example");
    expect(reasonCode(outcome)).toBe("CONFIG_LOAD_FAILING");
  }, 20_000);

  it("at start, is told as a failure rather than as starting", async () => {
    const fixture = project({ config: "none" });
    writeFileSync(fixture.config, MISSPELLED);
    const url = await start(fixture.root);

    const u = ui(url);
    await until(() => hasStatus(u, "failed"));
    const outcome = await preview(url);

    expect(lastStatus(u, "failed")).toMatchObject({ configFile: null, lastGoodAt: null, error: { code: "CONFIG_INVALID" } });
    expect(reasonCode(outcome)).toBe("CONFIG_LOAD_FAILING");
  }, 20_000);
});

describe("an outcome that cannot be applied", () => {
  it("is told as a failure when the binding table refuses the config, and Studio keeps running what it ran", async () => {
    const fixture = project();
    const { url, first } = await loadedStudio(fixture);
    const loadedAt = lastStatus(first, "loaded")?.loadedAt;
    const refused = vi.spyOn(BindingTable.prototype, "setConfig").mockImplementationOnce(() => {
      throw new Error("the binding table refused the config");
    });

    appendFileSync(fixture.demo, "// saved\n");
    await until(() => hasStatus(first, "failed"));
    const late = ui(url);
    await until(() => hasStatus(late, "failed"));

    expect(refused).toHaveBeenCalledOnce();
    const failed = { state: "failed", lastGoodAt: loadedAt, error: { message: "the binding table refused the config" } };
    expect(lastStatus(first, "failed")).toMatchObject(failed);
    expect(lastStatus(late, "failed")).toMatchObject(failed);
    expect(demoBaseURL(payloads(late, "scan:sources").at(-1))).toBe("https://v1.example");

    appendFileSync(fixture.demo, "// saved again\n");
    await until(() => statuses(first).at(-1)?.state === "loaded");
    expect(demoBaseURL(payloads(first, "scan:sources").at(-1))).toBe("https://v3.example");
  }, 20_000);

  it("is told as loaded when its mocks cannot be handed over, and the config runs", async () => {
    const fixture = project();
    handover.throwNext = true;
    const url = await start(fixture.root);

    const u = ui(url);
    await until(() => hasStatus(u, "loaded"));
    const outcome = await preview(url);

    expect(handover.throwNext).toBe(false);
    expect(lastStatus(u, "loaded")).toMatchObject({ configFile: "courier.config.ts" });
    expect(demoBaseURL(payloads(u, "scan:sources").at(-1))).toBe("https://v1.example");
    expect(outcome).toMatchObject({ status: "ready" });
  }, 20_000);

  it("is told when the mocks file throws a value with no string form, and the wizard and the banner say why", async () => {
    const fixture = project();
    writeFileSync(join(fixture.root, "courier.mocks.ts"), "throw Object.create(null);\n");
    const url = await start(fixture.root);

    const u = ui(url);
    await until(() => hasStatus(u, "loaded"));
    const outcome = await preview(url);

    expect(lastStatus(u, "loaded")).toMatchObject({ configFile: "courier.config.ts" });
    expect(reasonCode(outcome)).toBe("MOCKS_LOAD_FAILING");
    expect(startupIssues()).toEqual(["courier.mocks.ts did not load, so no mocks are declared: [Object: null prototype] {}"]);
  }, 20_000);

  it("is told even when recording it for the banner throws, and the reloads after it run", async () => {
    const fixture = project({ config: "broken" });
    issues.throwNext = true;
    const url = await start(fixture.root);
    const u = ui(url);
    await until(() => hasStatus(u, "failed"));
    const told = lastStatus(u, "failed");

    writeFileSync(fixture.config, FIXED);
    await until(() => hasStatus(u, "loaded"));

    expect(issues.throwNext).toBe(false);
    expect(told).toMatchObject({ state: "failed", configFile: null, lastGoodAt: null });
    expect(lastStatus(u, "loaded")).toMatchObject({ state: "loaded", configFile: "courier.config.ts" });
    expect(demoBaseURL(payloads(u, "scan:sources").at(-1))).toBe("https://v1.example");
  }, 20_000);
});
