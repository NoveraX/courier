/**
 * Studio's API answers only its own page, and fetches a specification from a
 * private host only while a courier.config that loads names it: never from
 * the last list that loaded, and never an address that means every
 * interface. A host that is not private reads no config at all.
 */

import type * as Dns from "node:dns";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { createOriginGuard } from "../src/server/origin-guard";
import { createStudioOriginPolicy } from "../src/server/studio-origin";
import type { StudioServer } from "../src/server/types";

/* Names this test resolves itself; every other name resolves as usual. */
const RESOLVED = vi.hoisted(() => new Map<string, Array<{ address: string; family: number }>>());

vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof Dns>();
  const lookup = async (hostname: string, options: Dns.LookupAllOptions) =>
    RESOLVED.get(hostname) ?? actual.promises.lookup(hostname, options);
  return { ...actual, promises: { ...actual.promises, lookup } };
});

function call(origin: string | undefined) {
  const guard = createOriginGuard(
    createStudioOriginPolicy({ bindHost: "localhost", extraOrigins: [] }),
  );
  const next = vi.fn();
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const headers = { host: "localhost:6280", ...(origin === undefined ? {} : { origin }) };
  guard({ headers } as never, res as never, next);
  return { next, res };
}

describe("Studio's API", () => {
  it("answers its own UI", () => {
    const { next, res } = call("http://localhost:6280");

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("refuses a page on another site", () => {
    /* Studio listens on the developer's own machine, so every page they have
       open can reach it. */
    const { next, res } = call("https://evil.test");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("refuses a sandboxed frame, which names no site", () => {
    const { next, res } = call("null");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("answers a caller that is not a page at all", () => {
    /* curl, an editor, a script — a browser always names its origin when it
       calls across sites, so silence means this is not one. */
    const { next } = call(undefined);

    expect(next).toHaveBeenCalled();
  });
});

/* A name in a private network. It also resolves to this machine, first, where
   the test's spec server listens: a request Studio lets through connects there. */
const PRIVATE_NAME = "specs.internal.test";
/* A name for every interface, which reaches this machine's services. */
const UNSPECIFIED_NAME = "anywhere.internal.test";
/* A name on the public internet that, like the private one, also resolves to this machine first. */
const PUBLIC_NAME = "specs.public.test";

const EVALUATIONS = "courierSpecHostsEvaluations";
const COUNTER = `Reflect.set(globalThis, "${EVALUATIONS}", Number(Reflect.get(globalThis, "${EVALUATIONS}") ?? 0) + 1);\nexport {};\n`;
const BROKEN = 'import "./count";\nthrow new Error("courier.config is broken on purpose");\n';
const SPEC = JSON.stringify({ openapi: "3.1.0", info: { title: "Pets", version: "1" }, paths: {} });

let root: string;
let studio: StudioServer | undefined;
let specServer: Server | undefined;
let specPort = 0;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Reflect.deleteProperty(globalThis, EVALUATIONS);
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-spec-hosts-")));
  RESOLVED.set(PRIVATE_NAME, [
    { address: "127.0.0.1", family: 4 },
    { address: "10.20.30.40", family: 4 },
  ]);
  RESOLVED.set(UNSPECIFIED_NAME, [{ address: "0.0.0.0", family: 4 }]);
  RESOLVED.set(PUBLIC_NAME, [
    { address: "127.0.0.1", family: 4 },
    { address: "93.184.215.14", family: 4 },
  ]);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(SPEC);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  specServer = server;
  specPort = (server.address() as { port: number }).port;
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  await new Promise((resolve) => specServer?.close(resolve));
  specServer = undefined;
  RESOLVED.clear();
  Reflect.deleteProperty(globalThis, EVALUATIONS);
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function evaluations(): number {
  return Number(Reflect.get(globalThis, EVALUATIONS) ?? 0);
}

function writeProjectFile(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/* A config that loads, naming these private hosts in `studio.allowedSpecHosts`. */
function allowing(hosts: readonly string[]): string {
  return `import "./count";\nexport default { sources: { api: { baseURL: "https://api.example" } }, studio: { allowedSpecHosts: ${JSON.stringify(hosts)} } };\n`;
}

function project(config: string | null): void {
  writeProjectFile("count.ts", COUNTER);
  if (config !== null) writeProjectFile("courier.config.ts", config);
}

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(url: string, path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/* Studio started, and its first load of the config has an outcome: a route that reads the project waits for it. */
async function started(): Promise<string> {
  const url = await start();
  await post(url, "/api/apis/imports/check-all");
  return url;
}

function parse(url: string, host: string) {
  return post(url, "/api/apis/parse", {
    source: "url",
    content: `http://${host}:${specPort}/openapi.json`,
  });
}

describe("POST /api/apis/parse for a private host", () => {
  it("is allowed while a courier.config that loads names the host", async () => {
    project(allowing([PRIVATE_NAME]));
    const url = await start();

    const reply = await parse(url, PRIVATE_NAME);

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ title: "Pets" });
  }, 15_000);

  it("is refused 400 while a courier.config that loads does not name the host", async () => {
    project(allowing(["gitlab.internal"]));
    const url = await start();

    const reply = await parse(url, PRIVATE_NAME);

    expect(reply.status).toBe(400);
    expect(String(reply.body.error)).toContain(
      `Blocked request to private address: ${PRIVATE_NAME} (10.20.30.40).`,
    );
    expect(String(reply.body.error)).toContain(
      "Name the host in `studio.allowedSpecHosts` to allow it.",
    );
  }, 15_000);

  it("refused while courier.config does not load names the broken config, not studio.allowedSpecHosts", async () => {
    project(BROKEN);
    const url = await start();

    const reply = await parse(url, PRIVATE_NAME);

    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe("CONFIG_NOT_LOADING");
    expect(String(reply.body.error)).toContain("courier.config is broken on purpose");
    expect(String(reply.body.error)).toContain("Fix courier.config and try again.");
    expect(String(reply.body.error)).not.toContain("Name the host");
  }, 15_000);

  it("that the last good config named is refused with CONFIG_NOT_LOADING while courier.config does not load", async () => {
    project(allowing([PRIVATE_NAME]));
    const url = await start();
    const allowed = await parse(url, PRIVATE_NAME);
    writeProjectFile("courier.config.ts", BROKEN);

    const reply = await parse(url, PRIVATE_NAME);

    expect(allowed.status).toBe(200);
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe("CONFIG_NOT_LOADING");
  }, 15_000);

  it.each([
    ["in a project that never had one", false],
    ["once it is deleted, whatever the last one named", true],
  ])(
    "with no courier.config is refused with the advice to create one, %s",
    async (_case, hadOne) => {
      project(hadOne ? allowing([PRIVATE_NAME]) : null);
      const url = await started();
      if (hadOne) unlinkSync(join(root, "courier.config.ts"));

      const reply = await parse(url, PRIVATE_NAME);

      expect(reply.status).toBe(400);
      expect(String(reply.body.error)).toContain(
        `There is no courier.config in ${root}; create it and name the host in \`studio.allowedSpecHosts\` to allow it.`,
      );
    },
    15_000,
  );

  it("removed from studio.allowedSpecHosts by a save just before the request is refused; one added that way is allowed", async () => {
    project(allowing([PRIVATE_NAME]));
    const url = await start();
    const first = await parse(url, PRIVATE_NAME);

    writeProjectFile("courier.config.ts", allowing([]));
    const removed = await parse(url, PRIVATE_NAME);
    writeProjectFile("courier.config.ts", allowing([PRIVATE_NAME]));
    const added = await parse(url, PRIVATE_NAME);

    expect([first.status, removed.status, added.status]).toEqual([200, 400, 200]);
    expect(String(removed.body.error)).toContain("Blocked request to private address");
  }, 15_000);
});

describe("POST /api/apis/parse for an address that means every interface", () => {
  it.each([UNSPECIFIED_NAME, "[::ffff:0:0]"])(
    "stays refused even when studio.allowedSpecHosts names it: %s",
    async (host) => {
      project(allowing([host]));
      const url = await start();

      const reply = await parse(url, host);

      expect(reply.status).toBe(400);
      expect(String(reply.body.error)).toContain("Blocked request to unspecified address");
    },
    15_000,
  );
});

describe("POST /api/apis/parse for a host that is not private", () => {
  it.each([
    ["this machine", "127.0.0.1", "while courier.config loads", allowing([])],
    ["this machine", "127.0.0.1", "while courier.config does not load", BROKEN],
    ["the public internet", PUBLIC_NAME, "while courier.config loads", allowing([])],
    ["the public internet", PUBLIC_NAME, "while courier.config does not load", BROKEN],
  ])(
    "reads no config for %s (%s) %s",
    async (_what, host, _state, config) => {
      project(config);
      const url = await started();
      const before = evaluations();

      const reply = await parse(url, host);

      expect(reply.status).toBe(200);
      expect(evaluations() - before).toBe(0);
    },
    15_000,
  );
});
