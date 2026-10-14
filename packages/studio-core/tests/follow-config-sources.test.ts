/**
 * What the proxy serves while an attached server defines sources of its own.
 *
 * Each case runs a real process: it attaches to a project on disk, serves the
 * proxy through `createHandler`, and calls an upstream it starts itself. The
 * sources registered must stay the ones `courier.config.ts` declares, however
 * the application's modules define, redefine or name theirs.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ENTRY = pathToFileURL(resolve(__dirname, "../src/runtime/attach-runtime.ts")).href;
const ROOT_MODULES = resolve(__dirname, "../../../node_modules");

const API = `
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
const { endpoint } = courier();
const base = process.env.UPSTREAM ?? "http://127.0.0.1:9";
const users = defineGroup({ prefix: "users", expose: true, endpoints: { list: endpoint.get("") } });
const faults = defineGroup({ prefix: "faults", endpoints: { ping: endpoint.get("ping") } });
export const api = defineApi({ expose: true, baseURL: base, groups: { users, faults } });
export const dead = defineApi({
  expose: true,
  baseURL: base,
  groups: { down: defineGroup({ prefix: "down", endpoints: { ping: endpoint.get("x") } }) },
});
`;

const NAMED = `
import { courier, defineApi } from "@noverax/courier/define";
const { endpoint } = courier();
const base = process.env.UPSTREAM ?? "http://127.0.0.1:9";
export const bin = defineApi({ expose: true, name: "bin", baseURL: base, endpoints: { a: endpoint.get("a") } });
export const txt = defineApi({ expose: true, name: "txt", baseURL: base, endpoints: { b: endpoint.get("b") } });
`;

const CONFIG = `
import { defineConfig } from "@noverax/courier/config";
import { api, dead } from "./api";
/* The config keeps from a page what the API's module opens, but for the group that marks itself. */
export default defineConfig({
  sources: { api: { ...api, options: { ...api.options, expose: false } }, dead },
});
`;

const NAMED_CONFIG = `
import { defineConfig } from "@noverax/courier/config";
import { bin, txt } from "./named";
export default defineConfig({ sources: { bin, txt } });
`;

/* Starts an upstream that echoes the path it was asked for, attaches, and
   hands the scenario a proxy call and a way to wait for the next
   registration. */
const PRELUDE = `
import http from "node:http";
import { pathToFileURL } from "node:url";
const upstream = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ path: req.url }));
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
process.env.UPSTREAM = "http://127.0.0.1:" + upstream.address().port;
process.env.COURIER_STUDIO_URL = "http://127.0.0.1:1";
const { attachRuntime } = await import(${JSON.stringify(ENTRY)});
const { createHandler, getSources } = await import("@noverax/courier");
const { onSourcesChange } = await import("@noverax/courier/internal");
const { courier, defineApi, defineGroup } = await import("@noverax/courier/define");
const handle = await attachRuntime("server");
const { handle: serve } = createHandler();
const call = async (s, g, m) => {
  const q = new URLSearchParams({ _s: s, _m: m, ...(g ? { _g: g } : {}) });
  const res = await serve(new Request("http://localhost/api/request?" + q, {
    headers: { origin: "http://localhost" },
  }));
  return res.status;
};
const registered = () => new Promise((r) => {
  const stop = onSourcesChange(() => { stop(); r(true); });
  setTimeout(() => { stop(); r(false); }, 5000).unref();
});
const reimport = (file, tag) => import(pathToFileURL(process.cwd() + "/" + file).href + "?" + tag);
const { endpoint } = courier();
const out = {};
`;

const EPILOGUE = `
console.log("RESULT " + JSON.stringify(out));
handle.detach();
upstream.close();
`;

/* Each project made, removed once the file's tests are done: rmSync takes the
   node_modules link away without following it into the repository. */
const made: string[] = [];

afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeProject(config = CONFIG): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-follow-"));
  made.push(dir);
  symlinkSync(ROOT_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "api.ts"), API);
  writeFileSync(join(dir, "named.ts"), NAMED);
  writeFileSync(join(dir, "courier.config.ts"), config);
  return dir;
}

function runScenario(body: string, dir = makeProject()): Record<string, unknown> {
  const script = join(dir, "scenario.mts");
  writeFileSync(script, PRELUDE + body + EPILOGUE);
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const run = spawnSync(process.execPath, ["--import", tsx, script], {
    cwd: dir,
    timeout: 30_000,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development" },
  });
  const line = run.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  if (!line) throw new Error(`scenario printed no result:\n${run.stdout}\n${run.stderr}`);
  return JSON.parse(line.slice("RESULT ".length)) as Record<string, unknown>;
}

describe("sources an attached server defines after attaching", () => {
  it("leaves a config source alone when another source shares its host and a group name", () => {
    const result = runScenario(`
      out.before = await call("api", "users", "list");
      const settled = registered();
      defineApi({
        expose: true,
        baseURL: process.env.UPSTREAM,
        groups: { faults: defineGroup({ prefix: "faults", endpoints: { other: endpoint.get("o") } }) },
      });
      await settled;
      out.after = await call("api", "users", "list");
    `);

    expect(result).toEqual({ before: 200, after: 200 });
  }, 40_000);

  it("does not fail an application that names such a source differently", () => {
    const result = runScenario(`
      const settled = registered();
      defineApi({
        expose: true,
        name: "dd",
        baseURL: process.env.UPSTREAM,
        groups: { faults: defineGroup({ prefix: "faults", endpoints: { slow: endpoint.get("s") } }) },
      });
      await settled;
      out.after = await call("api", "users", "list");
      out.dd = await call("dd", "faults", "slow");
    `);

    expect(result).toEqual({ after: 200, dd: 400 });
  }, 40_000);

  it("keeps a source the config never declared out of the proxy", () => {
    const result = runScenario(`
      const settled = registered();
      defineApi({
        expose: true,
        baseURL: "http://127.0.0.1:" + new URL(process.env.UPSTREAM).port,
        groups: { internal: defineGroup({ prefix: "users", endpoints: { all: endpoint.get("") } }) },
      });
      await settled;
      out.keys = Object.keys(getSources() ?? {}).sort();
      out.status = await call("127", "internal", "all");
    `);

    expect(result).toEqual({ keys: ["api", "dead"], status: 400 });
  }, 40_000);

  it("registers named sources that share a host, and keeps them when the module loads again", () => {
    const result = runScenario(
      `
      out.first = [await call("bin", undefined, "a"), await call("txt", undefined, "b")];
      const settled = registered();
      await reimport("named.ts", "again");
      await settled;
      out.again = [await call("bin", undefined, "a"), await call("txt", undefined, "b")];
    `,
      makeProject(NAMED_CONFIG),
    );

    expect(result).toEqual({ first: [200, 200], again: [200, 200] });
  }, 40_000);

  it("keeps the sources it registered when an edit leaves the config unusable", () => {
    const result = runScenario(
      `
      const { readFileSync, writeFileSync } = await import("node:fs");
      const file = process.cwd() + "/named.ts";
      writeFileSync(file, readFileSync(file, "utf8").replace('name: "txt"', 'name: "text"'));
      const settled = registered();
      await reimport("named.ts", "broken");
      out.registered = await settled;
      out.after = [await call("bin", undefined, "a"), await call("txt", undefined, "b")];
    `,
      makeProject(NAMED_CONFIG),
    );

    expect(result).toEqual({ registered: false, after: [200, 200] });
  }, 40_000);

  it("keeps the marks a config source carries when the application loads the module again", () => {
    const result = runScenario(`
      out.before = await call("api", "faults", "ping");
      const settled = registered();
      await reimport("api.ts", "server-component");
      await settled;
      out.after = await call("api", "faults", "ping");
      out.exposed = await call("api", "users", "list");
    `);

    expect(result).toEqual({ before: 400, after: 400, exposed: 200 });
  }, 40_000);

  it("serves an endpoint added to a source once the application redefines it", () => {
    const dir = makeProject();
    const result = runScenario(
      `
      out.before = await call("dead", "down", "pong");
      const { readFileSync, writeFileSync } = await import("node:fs");
      const file = process.cwd() + "/api.ts";
      writeFileSync(file, readFileSync(file, "utf8").replace(
        'ping: endpoint.get("x")',
        'ping: endpoint.get("x"), pong: endpoint.get("y")',
      ));
      const settled = registered();
      await reimport("api.ts", "edited");
      await settled;
      out.after = await call("dead", "down", "pong");
    `,
      dir,
    );

    expect(result).toEqual({ before: 400, after: 200 });
  }, 40_000);
});
