/**
 * Starting Studio, and who it then answers.
 *
 * A held port was reported as "Studio already running" whoever held it,
 * onReady never fired and close() rejected; a config that was missing or
 * broken at start switched hot reload off for the whole session. With port 0
 * Studio reported `:0` and refused its own UI; its sockets took any page on
 * any site; and every start appended to the project's .gitignore. The mock
 * workers it starts read the transforms it keeps in the project's
 * node_modules.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer, type Server } from "node:net";
import { join } from "node:path";
import { createTransformCache, type TransformCache } from "@noverax/courier-studio-core/config";
import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server";
import { loadCourierConfig } from "../src/server/config-loader";
import type { StudioServer } from "../src/server/types";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A project directory under the repository's node_modules, so its config resolves the workspace packages. */
function project(): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, "project-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function start(options: Parameters<typeof createStudioServer>[0]): StudioServer {
  const server = createStudioServer(options);
  cleanups.push(() => server.close());
  return server;
}

describe("createStudioServer on a port someone else holds", () => {
  it("says so, never reports ready, and still closes", async () => {
    const port = await freePort();
    const holder: Server = createNetServer();
    await new Promise<void>((resolve) => holder.listen(port, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => holder.close(() => resolve())));
    let ready = false;

    const failure = await new Promise<Error>((resolve) => {
      const server = createStudioServer({
        port,
        host: "127.0.0.1",
        projectRoot: project(),
        onReady: () => {
          ready = true;
        },
        onError: resolve,
      });
      cleanups.push(() => server.close());
    });

    expect(failure.message).toContain(`Port ${port}`);
    expect(ready).toBe(false);
  });
});

describe("a config created after Studio started", () => {
  it("is picked up without a restart", async () => {
    const port = await freePort();
    const root = project();
    const url = await new Promise<string>((resolve) => {
      start({ port, host: "127.0.0.1", projectRoot: root, onReady: resolve });
    });
    const ui = connect(`${url}/ui`, { transports: ["websocket"] });
    cleanups.push(() => {
      ui.disconnect();
    });
    await new Promise<void>((resolve) => ui.once("connect", () => resolve()));
    const loaded = new Promise<{ state: string; configFile?: string }>((resolve) => {
      ui.on("config:status", (status: { state: string; configFile?: string }) => {
        if (status.state === "loaded") resolve(status);
      });
    });

    writeFileSync(
      join(root, "courier.config.ts"),
      'import { defineApi } from "@noverax/courier/define";\n' +
        'export default { sources: { api: defineApi({ baseURL: "https://api.example", endpoints: {} }) } };\n',
    );

    const status = await loaded;
    expect(status.configFile).toBe("courier.config.ts");
  }, 15_000);
});

/** Connect a socket with the headers a browser page would send, and report whether Studio took it. */
function connects(url: string, namespace: string, origin?: string): Promise<boolean> {
  const socket = connect(`${url}${namespace}`, {
    transports: ["websocket"],
    reconnection: false,
    ...(origin === undefined ? {} : { extraHeaders: { Origin: origin } }),
  });
  cleanups.push(() => {
    socket.disconnect();
  });
  return new Promise((resolve) => {
    socket.once("connect", () => resolve(true));
    socket.once("connect_error", () => resolve(false));
  });
}

function started(root: string, port = 0): Promise<{ url: string; server: StudioServer }> {
  return new Promise((resolve) => {
    const server = start({
      port,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: (url) => resolve({ url, server }),
    });
  });
}

describe("Studio on a port the system picked", () => {
  it("reports the port it listens on, and answers its own UI there", async () => {
    const { url, server } = await started(project());

    expect(url).not.toMatch(/:0$/);
    expect(server.url).toBe(url);
    const reply = await fetch(`${url}/api/sessions/list`, {
      method: "POST",
      headers: { Origin: url, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(reply.status).not.toBe(403);
  });
});

describe("a page served on another local port", () => {
  /* Port 4382 is where the Studio UI's own dev server runs; any other local app may run there too. */
  const DEV_ORIGIN = "http://localhost:4382";

  it("is not taken as the Studio UI by its API", async () => {
    const { url } = await started(project());

    const reply = await fetch(`${url}/api/sessions/list`, {
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: "{}",
    });

    expect(reply.status).toBe(403);
  });

  it("is not taken as the Studio UI by its sockets", async () => {
    const { url } = await started(project(), await freePort());

    expect(await connects(url, "/ui", DEV_ORIGIN)).toBe(false);
  });

  it("is, when a dev server proxies it to Studio under its own host", async () => {
    const { url } = await started(project());
    const { port } = new URL(url);

    /* What the UI's dev server forwards: the page's Origin, and the Host the page called. */
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/api/sessions/list",
          setHost: false,
          headers: { host: "localhost:4382", origin: DEV_ORIGIN, "content-type": "application/json" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.end("{}");
    });

    expect(status).toBe(200);
  });
});

describe("Studio's sockets", () => {
  it("refuse a page on another site, on every namespace", async () => {
    const { url } = await started(project(), await freePort());

    expect(await connects(url, "/ui", "https://evil.example")).toBe(false);
    expect(await connects(url, "/runtime", "https://evil.example")).toBe(false);
  });

  it("take the UI from Studio's own page only", async () => {
    const { url } = await started(project(), await freePort());

    expect(await connects(url, "/ui", url)).toBe(true);
    expect(await connects(url, "/ui", "http://localhost:5173")).toBe(false);
  });

  it("take a runtime from an app page on this machine, or from a process", async () => {
    const { url } = await started(project(), await freePort());

    expect(await connects(url, "/runtime", "http://localhost:5173")).toBe(true);
    expect(await connects(url, "/runtime")).toBe(true);
  });
});

describe("Studio in a project", () => {
  it("leaves the project's .gitignore alone", async () => {
    const root = project();
    writeFileSync(join(root, ".gitignore"), "node_modules\n");

    await started(root);

    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toBe("node_modules\n");
  });
});

/** A project whose courier.mocks.ts starts a mock on `mockPort` with Studio; returns the mocks file. */
function mockedProject(root: string, mockPort: number): string {
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "api.ts"),
    'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
      'import { z } from "zod";\n' +
      "const { endpoint } = courier();\n" +
      "const User = z.object({ id: z.number(), name: z.string() });\n" +
      'const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response(z.array(User)) } });\n' +
      'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n',
  );
  writeFileSync(join(root, "courier.config.ts"), 'import { api } from "./src/api";\nexport default { sources: { api } };\n');
  const mocksFile = join(root, "courier.mocks.ts");
  writeFileSync(
    mocksFile,
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
      'import { api } from "./src/api";\n' +
      `export default defineMocks({ apiMock: defineMockServer({ source: api, port: ${mockPort}, autoStart: true }) });\n`,
  );
  return mocksFile;
}

describe("the mock workers Studio starts", () => {
  it("read the transforms Studio keeps in the project's node_modules", async () => {
    vi.stubEnv("COURIER_TRANSFORM_CACHE", "on");
    cleanups.push(() => {
      vi.unstubAllEnvs();
    });
    const root = realpathSync(project());
    mkdirSync(join(root, "node_modules"));
    const mockPort = await freePort();
    const mocksFile = mockedProject(root, mockPort);
    /* Where Studio keeps transforms, a transform of courier.mocks.ts that
       seeds 3 users: a worker serves 3 only if it reads that directory. */
    const kept = createTransformCache({ directory: join(root, "node_modules", ".cache", "courier", "transform") });
    const marked: string[] = [];
    const seeding: TransformCache = {
      transform: (options, compute) =>
        kept.transform(options, (miss) => {
          const result = compute(miss);
          if (miss.filename !== mocksFile) return result;
          marked.push(miss.filename);
          return { code: result.code.replace(`port: ${mockPort}`, `port: ${mockPort}, seed: { count: 3 }`) };
        }),
    };
    await loadCourierConfig(root, { transformCache: seeding });

    await started(root);
    const users = await vi.waitFor(
      async () => {
        const reply = await fetch(`http://127.0.0.1:${mockPort}/users`);
        expect(reply.status).toBe(200);
        return (await reply.json()) as unknown;
      },
      { timeout: 20_000, interval: 200 },
    );

    expect(marked).toEqual([mocksFile]);
    expect(users).toHaveLength(3);
  }, 40_000);
});

describe("a mocks file edited while its mocks run", () => {
  it("keeps a running mock and its records when only another mock is added", async () => {
    const root = realpathSync(project());
    const [mockPort, addedPort] = [await freePort(), await freePort()];
    const mocksFile = mockedProject(root, mockPort);
    const api = join(root, "src", "api.ts");
    writeFileSync(
      api,
      readFileSync(api, "utf-8").replace(
        'getAll: endpoint.get("").response(z.array(User))',
        'getAll: endpoint.get("").response(z.array(User)), create: endpoint.post("").response(User)',
      ),
    );
    await started(root);
    const users = `http://127.0.0.1:${mockPort}/users`;
    await vi.waitFor(async () => expect((await fetch(users)).status).toBe(200), { timeout: 20_000, interval: 200 });
    const created = await fetch(users, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Kept" }),
    });
    expect(created.ok).toBe(true);

    writeFileSync(
      mocksFile,
      readFileSync(mocksFile, "utf-8").replace(
        "autoStart: true }) });",
        `autoStart: true }), added: defineMockServer({ source: api, port: ${addedPort}, autoStart: true }) });`,
      ),
    );
    await vi.waitFor(
      async () => expect((await fetch(`http://127.0.0.1:${addedPort}/users`)).status).toBe(200),
      { timeout: 20_000, interval: 200 },
    );

    const listed: Array<{ name?: unknown }> = await (await fetch(users)).json();
    expect(listed.map((user) => user.name)).toContain("Kept");
  }, 60_000);
});
