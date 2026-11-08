/**
 * Whether the process runs in production, as each check that asks reads
 * it: a value Object.prototype holds may make a check stricter, never
 * weaker. Every development allowance — a loopback page's write, Studio's
 * pass, the warnings that name an endpoint — is one that production
 * closes, so it takes `"production"` wherever it is found: the bundler's
 * literal, the environment's own variable, or the prototype's, as on an
 * edge runtime with no `NODE_ENV` of its own. A `process` the runtime does
 * not own makes no development either. The one check production opens, a
 * host no setting names, takes it only beyond doubt.
 */
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isHostServed } from "../../src/adapter/host-policy";
import { isOriginAllowed } from "../../src/adapter/origin-policy";
import { isDevelopment } from "../../src/utils/development";

const SRC = resolve(import.meta.dirname, "../../src");

/* The environment's own NODE_ENV, taken away for each test and put back after it. */
let own: string | undefined;
let owned = false;

beforeEach(() => {
  owned = Object.hasOwn(process.env, "NODE_ENV");
  own = process.env.NODE_ENV;
  Reflect.deleteProperty(process.env, "NODE_ENV");
});

afterEach(() => {
  Reflect.deleteProperty(Object.prototype, "NODE_ENV");
  if (owned) Reflect.set(process.env, "NODE_ENV", own);
});

function onPrototype(mode: string): void {
  Object.defineProperty(Object.prototype, "NODE_ENV", {
    value: mode,
    configurable: true,
    writable: true,
  });
}

/* A write from a page the developer's machine serves on another port. */
function loopbackWrite(): Request {
  return new Request("http://localhost:3000/api/request", {
    method: "POST",
    headers: { origin: "http://localhost:5173", "sec-fetch-site": "same-site" },
  });
}

/* How a bundle the bundler wrote `NODE_ENV` into reads the mode, run where `setup` says. */
async function bundled(
  setup: string,
  written: string | undefined,
): Promise<{ development: boolean; mode: unknown }> {
  const result = await build({
    stdin: {
      contents: `export { isDevelopment } from "./utils/development"; export { nodeEnvironment } from "./utils/environment";`,
      resolveDir: SRC,
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "built",
    platform: "neutral",
    write: false,
    ...(written !== undefined && { define: { "process.env.NODE_ENV": JSON.stringify(written) } }),
  });
  const code = result.outputFiles[0]?.text ?? "";
  return runInNewContext(
    `${setup};\n${code};\n({ development: built.isDevelopment(), mode: built.nodeEnvironment() })`,
    {},
  ) as { development: boolean; mode: unknown };
}

/* An edge runtime: a `process` of its own, an environment with no NODE_ENV, the prototype's word. */
const EDGE = (mode: string) =>
  `Object.defineProperty(Object.prototype, "NODE_ENV", { value: ${JSON.stringify(mode)}, configurable: true }); globalThis.process = { env: {} }`;

describe("a development allowance, where the environment names no mode", () => {
  it("stays closed when the prototype says production", () => {
    onPrototype("production");

    expect(isDevelopment()).toBe(false);
    expect(isOriginAllowed(loopbackWrite())).toBe(false);
  });

  it("stays open with no mode anywhere, as a server without NODE_ENV runs in development", () => {
    expect(isDevelopment()).toBe(true);
    expect(isOriginAllowed(loopbackWrite())).toBe(true);
  });
});

describe("a bundle the bundler wrote production into, on an edge runtime", () => {
  it("runs in production when the prototype says production too", async () => {
    expect((await bundled(EDGE("production"), "production")).development).toBe(false);
  });

  it("runs in production when the prototype says development", async () => {
    expect((await bundled(EDGE("development"), "production")).development).toBe(false);
  });
});

describe("a process the runtime does not own", () => {
  it("makes no development, whatever its environment says", async () => {
    const planted = `Object.defineProperty(Object.prototype, "process", { value: { env: { NODE_ENV: "development" } }, configurable: true })`;

    expect((await bundled(planted, undefined)).development).toBe(false);
  });
});

describe("a host no setting names", () => {
  it("is served in production only when the environment's own NODE_ENV says so", () => {
    onPrototype("production");
    expect(isHostServed("rebound.example:3000", undefined)).toBe(false);

    Reflect.set(process.env, "NODE_ENV", "production");
    expect(isHostServed("rebound.example:3000", undefined)).toBe(true);
  });

  it("is not served where production could be the prototype's alone, the bundler's literal beside it", async () => {
    expect((await bundled(EDGE("production"), "production")).mode).toBeUndefined();
    expect((await bundled(EDGE("development"), "production")).mode).toBe("production");
  });
});
