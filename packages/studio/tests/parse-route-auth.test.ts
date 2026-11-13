/**
 * A specification behind auth, imported by URL: the import wizard names
 * the environment variable that holds each credential, one the project's
 * .env files set and no other of the shell Studio was started from; Studio
 * reads it as it fetches, sends it to the URL's own origin only, and
 * neither answers it nor logs it. A value sent in the request is refused,
 * and so is a page without the project's token. An import courier.config
 * declares is read by its name, with the auth the config gives it, from
 * the process's environment; and the wizard is told whether each variable
 * is set, never its value.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectEnv } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

/* Made up for the test: the project's .env.local sets the one, this process alone the other. */
const SECRET = "spec-token-5f1c-made-up";
const VARIABLE = "COURIER_TEST_ORDERS_SPEC_TOKEN";
const SHELL_VARIABLE = "COURIER_TEST_SHELL_SPEC_TOKEN";

let root: string;
let studio: StudioServer | undefined;
const servers: Server[] = [];
const logged: unknown[][] = [];

beforeEach(() => {
  for (const level of ["warn", "error", "info"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args));
  }
  process.env[SHELL_VARIABLE] = SECRET;
  root = mkdtempSync(join(tmpdir(), "courier-import-auth-"));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
  writeFileSync(join(root, ".env.local"), `${VARIABLE}=${SECRET}\n`);
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, VARIABLE);
  Reflect.deleteProperty(process.env, SHELL_VARIABLE);
  await studio?.close();
  studio = undefined;
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
  vi.restoreAllMocks();
  logged.length = 0;
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      projectEnv: createProjectEnv(root),
      onReady: resolve,
      onError: reject,
    });
  });
}

/* A specification served only to a request that carries the bearer token. */
async function privateSpec(): Promise<string> {
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${SECRET}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":"unauthorized"}');
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ openapi: "3.1.0", info: { title: "Private", version: "1" }, paths: {} }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address() as { port: number };
  return `http://127.0.0.1:${port}/openapi.json`;
}

async function parse(url: string, body: Record<string, unknown>, withToken = true) {
  const response = await fetch(`${url}/api/apis/parse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: url,
      ...(withToken && tokenHeader(studio)),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

describe("POST /api/apis/parse for a specification behind auth", () => {
  it("reads it with the token the variable of the project's .env.local it names holds", async () => {
    const url = await start();
    const specUrl = await privateSpec();

    const { status, text } = await parse(url, {
      source: "url",
      content: specUrl,
      auth: { type: "bearer", token: { env: VARIABLE } },
    });

    expect(status).toBe(200);
    expect(text).toContain("Private");
    expect(text).not.toContain(SECRET);
    expect(JSON.stringify(logged)).not.toContain(SECRET);
  });

  it("reads no variable the project's .env files do not set, though Studio's shell holds it", async () => {
    const url = await start();

    const { status, text } = await parse(url, {
      source: "url",
      content: await privateSpec(),
      auth: { type: "bearer", token: { env: SHELL_VARIABLE } },
    });

    expect(status).toBe(400);
    expect(text).toContain(`${SHELL_VARIABLE}, which is not set`);
    expect(text).not.toContain(SECRET);
  });

  it("says a variable that is not set by its name, before anything is sent", async () => {
    const url = await start();
    const specUrl = await privateSpec();

    const { status, text } = await parse(url, {
      source: "url",
      content: specUrl,
      auth: { type: "bearer", token: { env: "COURIER_TEST_UNSET_TOKEN" } },
    });

    expect(status).toBe(400);
    expect(text).toContain("COURIER_TEST_UNSET_TOKEN, which is not set");
  });

  it("refuses a credential's value sent in the request", async () => {
    const url = await start();

    const { status, text } = await parse(url, {
      source: "url",
      content: await privateSpec(),
      auth: { type: "bearer", token: SECRET },
    });

    expect(status).toBe(400);
    expect(text).toContain("SECRET_NOT_REFERENCED");
    expect(text).not.toContain(SECRET);
  });

  it("refuses a page without the project's token, which no environment of Studio's is read for", async () => {
    const url = await start();

    const { status, text } = await parse(
      url,
      {
        source: "url",
        content: await privateSpec(),
        auth: { type: "bearer", token: { env: VARIABLE } },
      },
      false,
    );

    expect(status).toBe(401);
    expect(text).not.toContain(SECRET);
  });
});

/* The project imports `orders` from the private specification, with the token the shell's variable holds. */
function declareOrders(specUrl: string): void {
  writeFileSync(
    join(root, "courier.config.ts"),
    `export default { sources: { api: { baseURL: "https://api.example" } }, imports: { orders: { importType: "url", type: "openapi", from: "${specUrl}", auth: { type: "bearer", token: { env: "${SHELL_VARIABLE}" } }, outputDir: "src/api" } } };\n`,
  );
}

describe("POST /api/apis/parse for an import courier.config declares", () => {
  it("reads it from its URL with its auth, by its name alone", async () => {
    declareOrders(await privateSpec());
    const url = await start();

    const { status, text } = await parse(url, { source: "import", content: "orders" });

    expect(status).toBe(200);
    expect(text).toContain("Private");
    expect(text).not.toContain(SECRET);
  });

  it("refuses it to a page without the project's token, and says no import it does not declare", async () => {
    declareOrders(await privateSpec());
    const url = await start();

    const untrusted = await parse(url, { source: "import", content: "orders" }, false);
    const missing = await parse(url, { source: "import", content: "billing" });

    expect(untrusted.status).toBe(401);
    expect(untrusted.text).toContain("STUDIO_TOKEN_REQUIRED");
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/apis/auth-variables", () => {
  async function variables(url: string, body: unknown, withToken = true) {
    const response = await fetch(`${url}/api/apis/auth-variables`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: url,
        ...(withToken && tokenHeader(studio)),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, text: await response.text() };
  }

  it("says whether the project's .env files set each variable, and never its value", async () => {
    const url = await start();

    const { status, text } = await variables(url, {
      names: [VARIABLE, SHELL_VARIABLE, "COURIER_TEST_UNSET_TOKEN"],
    });

    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      variables: [
        { name: VARIABLE, set: true },
        { name: SHELL_VARIABLE, set: false },
        { name: "COURIER_TEST_UNSET_TOKEN", set: false },
      ],
    });
    expect(text).not.toContain(SECRET);
  });

  it("answers for no name written otherwise than in capitals, and says none back", async () => {
    const url = await start();

    for (const name of ["__proto__", "npm_config_cache", "sk_live_51HmadeUp9f2c"]) {
      const { status, text } = await variables(url, { names: [VARIABLE, name] });

      expect(status).toBe(400);
      expect(JSON.parse(text)).toMatchObject({ code: "SECRET_NAME_INVALID" });
      expect(text).not.toContain(name);
    }
  });

  it("answers only a page with the project's token, and only for names a variable can have", async () => {
    const url = await start();

    const untrusted = await variables(url, { names: [VARIABLE] }, false);
    const invalid = await variables(url, { names: ["ORDERS TOKEN"] });
    const none = await variables(url, { names: [] });

    expect(untrusted.status).toBe(401);
    expect(untrusted.text).not.toContain("true");
    expect(invalid.status).toBe(400);
    expect(none.status).toBe(400);
  });
});
