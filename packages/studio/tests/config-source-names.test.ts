/**
 * Which source Studio names a direct call after.
 *
 * A runtime that calls an API directly reports the name its own copy of the
 * definition carries. In a browser, and in a server that imports the module
 * the config imports, no registry saw that copy, so its name is the one
 * derived from the baseURL host. Studio names the call after the config
 * source that declares the endpoint instead: otherwise every direct row
 * reads "localhost", the Explorer shows that phantom source beside the real
 * ones, and each endpoint is counted twice.
 *
 * A real Studio server runs a project here, a runtime attaches to it without
 * a registry of its own, and its calls reach a real upstream.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { join } from "node:path";
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { attachRuntime } from "@noverax/courier-studio-core/runtime";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server";
import { getRuntimeEntry } from "../src/server/runtime-namespace-state";

const cleanups: Array<() => Promise<void> | void> = [];
const events: Array<Record<string, unknown>> = [];
let root = "";
let upstream = "";

/** The sources the project declares. */
const SOURCES = `
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
const BASE = process.env.COURIER_TEST_UPSTREAM;
const { endpoint } = courier();
const ping = () => ({ ping: endpoint.get("ping") });
const group = (prefix, endpoints) => ({ [prefix]: defineGroup({ prefix, endpoints }) });
export const sources = {
  api: defineApi({ baseURL: BASE, groups: group("users", { list: endpoint.get("") }) }),
  dead: defineApi({ baseURL: BASE, groups: group("down", ping()) }),
  left: defineApi({ baseURL: BASE, groups: group("same", ping()) }),
  right: defineApi({ baseURL: BASE, groups: group("same", ping()) }),
};
`;

/**
 * The application's own copy of the same definitions. Studio runs in this
 * process too, and a module both imported would be the copy it registered.
 */
function appSources(base: string) {
  const { endpoint } = courier();
  const ping = { ping: endpoint.get("ping") };
  return {
    api: defineApi({
      baseURL: base,
      groups: { users: defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } }) },
    }),
    dead: defineApi({
      baseURL: base,
      groups: { down: defineGroup({ prefix: "down", endpoints: ping }) },
    }),
    left: defineApi({
      baseURL: base,
      groups: { same: defineGroup({ prefix: "same", endpoints: ping }) },
    }),
  };
}

/** The upstream both the config and this process's copy of it call. */
async function startUpstream(): Promise<string> {
  const server: Server = createHttpServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://localhost:${(server.address() as { port: number }).port}`;
}

function writeProject(): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, "project-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "sources.mjs"), SOURCES);
  writeFileSync(
    join(dir, "courier.config.ts"),
    'import { sources } from "./sources.mjs";\nexport default { sources };\n',
  );
  return dir;
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeAll(async () => {
  upstream = await startUpstream();
  process.env.COURIER_TEST_UPSTREAM = upstream;
  root = writeProject();
  /* Port 0: the system picks one as Studio binds it, so no other test can take it in between. */
  const url = await new Promise<string>((resolve) => {
    const studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
    });
    cleanups.push(() => studio.close());
  });
  const ui: Socket = connect(`${url}/ui`, { transports: ["websocket"] });
  cleanups.push(() => {
    ui.disconnect();
  });
  const loaded = new Promise<void>((resolve) => {
    ui.on("config:status", (status: { state: string }) => {
      if (status.state === "loaded") resolve();
    });
  });
  ui.on("events", (batch: Array<Record<string, unknown>>) => events.push(...batch));
  await loaded;

  process.env.COURIER_STUDIO_URL = url;
  const runtime = await attachRuntime("own-copy");
  cleanups.push(() => runtime.detach());
  await until(() => getRuntimeEntry("own-copy") !== undefined, "the runtime to connect");
}, 30_000);

afterAll(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("a direct call made with a copy of the definition no registry saw", () => {
  it("is named after the config source that declares the endpoint", async () => {
    const copy = appSources(upstream);
    await createCaller(copy.api).users.list();
    await createCaller(copy.dead).down.ping();
    await until(() => events.filter((e) => e.type === "request:start").length >= 2, "two calls");

    const started = events.filter((e) => e.type === "request:start");
    expect(
      started.map((e) => `${String(e.source)}.${String(e.group)}.${String(e.method)}`),
    ).toEqual(["api.users.list", "dead.down.ping"]);
  });

  it("keeps the name it reported when two config sources declare the endpoint", async () => {
    events.length = 0;
    await createCaller(appSources(upstream).left).same.ping();
    await until(() => events.some((e) => e.type === "request:start"), "the call");

    expect(events.find((e) => e.type === "request:start")?.source).toBe("localhost");
  });
});
