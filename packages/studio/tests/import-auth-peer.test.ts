/**
 * A page on another machine — a phone, a laptop on the same network — that
 * holds the project's token still has Studio send none of its variables:
 * a read with credentials is refused 403 `NOT_LOCAL_PEER` before the host
 * it names is reached, and so is the question of which variables are set.
 * The same requests from this machine are answered as before.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectEnv } from "@noverax/courier-cli/devkit";
import express from "express";
import type { RequestHandler } from "express-serve-static-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerAuthVariablesRoute } from "../src/server/auth-variables-route";
import { pageVariables } from "../src/server/import-auth-headers";
import { registerParseRoute } from "../src/server/parse-route";
import type { ProjectReads } from "../src/server/project-state/types";

/* Made up for the test, and set by the project's .env file. */
const SECRET = "peer-spec-token-8b2e-made-up";
const VARIABLE = "COURIER_TEST_PEER_SPEC_TOKEN";
/* A documentation address: no machine of this one's. */
const ELSEWHERE = "203.0.113.9";

let root: string;
const servers: Server[] = [];
const sent: (string | undefined)[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-import-peer-"));
  writeFileSync(join(root, ".env"), `${VARIABLE}=${SECRET}\n`);
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, VARIABLE);
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  sent.length = 0;
  rmSync(root, { recursive: true, force: true });
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(server);
  const { port } = server.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

/* The routes as Studio mounts them, for a page with the token; its requests arrive from `peer`, or from this machine. */
async function studio(peer?: string): Promise<string> {
  const app = express();
  const fromPeer: RequestHandler = (req, _res, next) => {
    Object.defineProperty(req.socket, "remoteAddress", { value: peer, configurable: true });
    next();
  };
  if (peer !== undefined) app.use(fromPeer);
  app.use(express.json());
  const projectEnv = createProjectEnv(root);
  registerParseRoute(app, {
    project: {} as ProjectReads,
    projectRoot: root,
    holdsToken: () => true,
    demo: false,
    projectEnv,
  });
  registerAuthVariablesRoute(app, () => pageVariables(projectEnv));
  return listen(createServer(app));
}

/* A host the page names, which keeps the Authorization it was sent. */
async function namedHost(): Promise<string> {
  const host = createServer((req, res) => {
    sent.push(req.headers.authorization);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ openapi: "3.1.0", info: { title: "Named", version: "1" }, paths: {} }),
    );
  });
  return `${await listen(host)}/openapi.json`;
}

async function post(url: string, path: string, body: unknown) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

const withAuth = (content: string) => ({
  source: "url",
  content,
  auth: { type: "bearer", token: { env: VARIABLE } },
});

describe("a page with the token, on another machine", () => {
  it("is refused a read with credentials, and the host it names is never reached", async () => {
    const url = await studio(ELSEWHERE);

    const { status, text } = await post(url, "/api/apis/parse", withAuth(await namedHost()));

    expect(status).toBe(403);
    expect(JSON.parse(text)).toMatchObject({ code: "NOT_LOCAL_PEER" });
    expect(text).toContain("--bearer-env");
    expect(sent).toEqual([]);
    expect(text).not.toContain(SECRET);
  });

  it("is not told whether a variable is set", async () => {
    const url = await studio(ELSEWHERE);

    const { status, text } = await post(url, "/api/apis/auth-variables", { names: [VARIABLE] });

    expect(status).toBe(403);
    expect(JSON.parse(text)).toMatchObject({ code: "NOT_LOCAL_PEER" });
    expect(JSON.parse(text)).not.toHaveProperty("variables");
  });

  it("is still read a specification that takes no credentials", async () => {
    const url = await studio(ELSEWHERE);

    const { status } = await post(url, "/api/apis/parse", {
      source: "url",
      content: await namedHost(),
    });

    expect(status).toBe(200);
    expect(sent).toEqual([undefined]);
  });
});

describe("a page with the token, on this machine", () => {
  it("is read the specification with the credential its variable holds, and told it is set", async () => {
    const url = await studio();

    const parsed = await post(url, "/api/apis/parse", withAuth(await namedHost()));
    const variables = await post(url, "/api/apis/auth-variables", { names: [VARIABLE] });

    expect(parsed.status).toBe(200);
    expect(sent).toEqual([`Bearer ${SECRET}`]);
    expect(parsed.text).not.toContain(SECRET);
    expect(JSON.parse(variables.text)).toEqual({ variables: [{ name: VARIABLE, set: true }] });
  });
});
