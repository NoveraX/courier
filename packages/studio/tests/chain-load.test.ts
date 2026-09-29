/**
 * A load on the reload chain runs under a timeout: one that runs out throws
 * `CONFIG_LOAD_TIMEOUT`, naming both files a load evaluates and the variable
 * that gives a slow project longer, and carrying what the load read; a load
 * given up that succeeds or fails later is handed over once, with the error
 * its caller was thrown; and how many are still running is logged, as a
 * warning once they pile up.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createChainLoad } from "../src/server/chain-load";
import { ConfigLoadTimeoutError } from "../src/server/config-load-timeout-error";
import type { LoadedCourierConfig } from "../src/server/config-loader";
import { loadCourierConfig } from "../src/server/config-loader";

const TIMEOUT_MS = 200;

let root: string;
let config: string;
let keys = 0;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A config that awaits what `globalThis` holds under a key of its own. */
function gatedConfig(): { text: string; open(): void } {
  const key = `__courierChainLoadGate${process.pid}_${++keys}`;
  const { promise, resolve } = Promise.withResolvers<void>();
  Reflect.set(globalThis, key, promise);
  const text = `await Reflect.get(globalThis, "${key}")\nexport default { sources: { demo: { baseURL: "late.example.com" } } }\n`;
  return { text, open: () => resolve() };
}

/* The first load in a process sets up the transformer, which alone can take
   longer than the timeout the tests use. */
beforeAll(async () => {
  const warm = realpathSync(mkdtempSync(join(tmpdir(), "chain-load-warm-")));
  writeFileSync(join(warm, "courier.config.ts"), "export default { sources: { demo: {} } }\n");
  await loadCourierConfig(warm);
  rmSync(warm, { recursive: true, force: true });
});

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "chain-load-")));
  config = join(root, "courier.config.ts");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("createChainLoad", () => {
  it("loads the project when it takes less than the timeout", async () => {
    writeFileSync(config, 'export default { sources: { demo: { baseURL: "v1.example.com" } } }\n');
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: 5000,
      onLateSuccess: vi.fn(),
      onLateFailure: vi.fn(),
    });

    const loaded = await chain.load();

    expect(loaded.configFile).toBe(config);
  });

  it("the timeout message names COURIER_CONFIG_LOAD_TIMEOUT_MS, and a budget under a second in milliseconds", async () => {
    writeFileSync(config, "await new Promise(() => {})\nexport default { sources: {} }\n");
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: TIMEOUT_MS,
      onLateSuccess: vi.fn(),
      onLateFailure: vi.fn(),
    });

    const error = await chain.load().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ConfigLoadTimeoutError);
    expect(error).toMatchObject({ code: "CONFIG_LOAD_TIMEOUT" });
    expect(error instanceof Error && error.message).toContain("COURIER_CONFIG_LOAD_TIMEOUT_MS");
    expect(error instanceof Error && error.message).toContain("longer than 200 ms");
  });

  it("the timeout message names courier.mocks, which a load evaluates after the config and may be what hangs", async () => {
    writeFileSync(config, 'export default { sources: { demo: { baseURL: "v1.example.com" } } }\n');
    writeFileSync(
      join(root, "courier.mocks.ts"),
      "await new Promise(() => {})\nexport default {}\n",
    );
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: TIMEOUT_MS,
      onLateSuccess: vi.fn(),
      onLateFailure: vi.fn(),
    });

    const error = await chain.load().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ConfigLoadTimeoutError);
    expect(error instanceof Error && error.message).toContain("courier.mocks");
  });

  it("a load given up carries what it read before evaluating, as handed to onInputs", async () => {
    const text = "await new Promise(() => {})\nexport default { sources: {} }\n";
    writeFileSync(config, text);
    const onInputs = vi.fn();
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: TIMEOUT_MS,
      onInputs,
      onLateSuccess: vi.fn(),
      onLateFailure: vi.fn(),
    });

    const error = await chain.load().catch((err: unknown) => err);

    expect(error instanceof ConfigLoadTimeoutError && error.depHashes?.get(config)).toBe(
      sha256(text),
    );
    expect(onInputs).toHaveBeenCalledOnce();
    expect(onInputs.mock.calls[0]?.[0]).toBe(
      error instanceof ConfigLoadTimeoutError ? error.depHashes : null,
    );
  });

  it("hands a load given up that succeeds later over once, with the error its caller was thrown", async () => {
    const gate = gatedConfig();
    writeFileSync(config, gate.text);
    const late: Array<[LoadedCourierConfig, ConfigLoadTimeoutError]> = [];
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: TIMEOUT_MS,
      onLateSuccess: (loaded, gaveUp) => late.push([loaded, gaveUp]),
      onLateFailure: vi.fn(),
    });
    const error = await chain.load().catch((err: unknown) => err);
    expect(late).toEqual([]);

    gate.open();
    await sleep(100);

    expect(late).toHaveLength(1);
    const [loaded, gaveUp] = late[0] ?? [];
    expect(loaded?.configFile).toBe(config);
    expect(gaveUp).toBe(error);
  });

  it("hands a load given up that fails later over once, with what it threw and the error its caller was thrown", async () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const key = `__courierChainLoadReject${process.pid}_${++keys}`;
    const { promise, reject } = Promise.withResolvers<void>();
    promise.catch(() => {});
    Reflect.set(globalThis, key, promise);
    writeFileSync(
      config,
      `await Reflect.get(globalThis, "${key}")\nexport default { sources: {} }\n`,
    );
    const onLateSuccess = vi.fn();
    const late: Array<[unknown, ConfigLoadTimeoutError]> = [];
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: TIMEOUT_MS,
      onLateSuccess,
      onLateFailure: (error, gaveUp) => late.push([error, gaveUp]),
    });
    const thrown = await chain.load().catch((err: unknown) => err);

    reject(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    await sleep(100);

    expect(onLateSuccess).not.toHaveBeenCalled();
    expect(late).toHaveLength(1);
    const [error, gaveUp] = late[0] ?? [];
    expect(error instanceof Error && error.message).toContain("ECONNREFUSED");
    expect(gaveUp).toBe(thrown);
    const lines = debug.mock.calls.map((call) => call.slice(1).join(" "));
    expect(
      lines.some((line) => line.includes("has failed; 0 loads given up are still running")),
    ).toBe(true);
  });

  it("warns once five loads given up are still running, since each keeps its modules in memory", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gate = gatedConfig();
    writeFileSync(config, gate.text);
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: TIMEOUT_MS,
      onLateSuccess: vi.fn(),
      onLateFailure: vi.fn(),
    });

    for (let load = 0; load < 4; load += 1) await chain.load().catch(() => undefined);
    expect(warn).not.toHaveBeenCalled();
    await chain.load().catch(() => undefined);
    gate.open();
    await sleep(100);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.slice(1).join(" ")).toContain(
      "5 loads of courier.config that Studio stopped waiting for are still running",
    );
  });

  it("logs how many loads given up are still running each time one is given up or finishes", async () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const gate = gatedConfig();
    writeFileSync(config, gate.text);
    const chain = createChainLoad({
      projectRoot: root,
      timeoutMs: TIMEOUT_MS,
      onLateSuccess: vi.fn(),
      onLateFailure: vi.fn(),
    });

    await chain.load().catch(() => undefined);
    await chain.load().catch(() => undefined);
    gate.open();
    await sleep(100);

    const counts = debug.mock.calls
      .map((call) => call.slice(1).join(" "))
      .map((line) => /(\d+) loads? given up (?:is|are) still running/.exec(line)?.[1])
      .filter((found) => found !== undefined);
    expect(counts).toEqual(["1", "2", "1", "0"]);
  });
});
