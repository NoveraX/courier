/**
 * A session as a file for a bug report: the requests with their answers and
 * timings, every credential and body field named like a secret replaced —
 * and listed for the person to look over — with the environment it was
 * recorded in; and the same file opened in a colleague's Studio, read as
 * untrusted input, kept as a session of its own and shown.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { sessionEnvironment } from "../src/server/session-file/session-environment";
import { readSessionFile, SESSION_FILE_FORMAT } from "../src/server/session-file/session-file";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";

let root: string;
let url: string;
let studio: StudioServer | undefined;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-session-file-"));
  symlinkSync(
    resolve(import.meta.dirname, "../../../node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "shop-app",
      dependencies: { zod: "*", "@noverax/courier": "*", hono: "*" },
    }),
  );
  writeFileSync(
    join(root, "courier.config.ts"),
    `import { courier, defineApi } from "@noverax/courier/define";
     import { z } from "zod";
     const { endpoint } = courier();
     export default { sources: { shop: defineApi({ baseURL: "https://shop.example", endpoints: { login: endpoint.post("login").variables(z.object({ email: z.string(), password: z.string() })) } }) } };`,
  );
  url = await new Promise<string>((done, fail) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: done,
      onError: fail,
    });
  });
});

afterAll(async () => {
  await studio?.close();
  rmSync(root, { recursive: true, force: true });
});

async function post(path: string, body: unknown, withToken = false): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withToken && { [TOKEN_HEADER]: studio?.token ?? "" }),
    },
    body: JSON.stringify(body),
  });
}

/* Studio reloads the config on its own; the fingerprint changes once it has. */
async function changedDefinition(from: string): Promise<string> {
  for (let tries = 0; tries < 100; tries++) {
    const shop = (await (await post("/api/sessions/environment", {})).json()).definitions.shop;
    if (shop !== from) return shop;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Studio did not reload the config");
}

const REQUESTS = [
  {
    id: "r1",
    source: "shop",
    method: "login",
    httpMethod: "POST",
    startedAt: 1,
    variables: { email: "ada@example.com", password: "hunter2" },
    data: { user: { id: "u1", accessToken: "tok_123" } },
    requestHeaders: { authorization: "Bearer secret", accept: "application/json" },
    statusCode: 200,
  },
  {
    id: "r2",
    source: "shop",
    method: "orders",
    httpMethod: "GET",
    startedAt: 2,
    variables: { page: 2 },
    url: "https://shop.example/orders?page=2&api_key=key_456&sort=new#top",
    statusCode: 200,
  },
];

describe("a session file", () => {
  it("carries the requests with every secret replaced, lists what it replaced, and names the environment", async () => {
    const response = await post("/api/sessions/file", { name: "Checkout bug", requests: REQUESTS });
    const file = await response.json();
    const text = JSON.stringify(file);

    expect(file).toMatchObject({ format: SESSION_FILE_FORMAT, version: 1 });
    expect(file.redactions).toEqual([
      "requests[0].variables.password",
      "requests[0].data.user.accessToken",
      "requests[1].url?api_key",
    ]);
    expect(file.session.requests[1].url).toBe(
      "https://shop.example/orders?page=2&api_key=[redacted]&sort=new#top",
    );
    expect(file.session.requests[0].variables).toEqual({
      email: "ada@example.com",
      password: "[redacted]",
    });
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("tok_123");
    expect(text).not.toContain("Bearer secret");
    expect(text).not.toContain("key_456");
    expect(file.environment).toMatchObject({
      node: process.version,
      packages: { zod: expect.stringMatching(/^\d/), hono: expect.stringMatching(/^\d/) },
    });
    expect(file.environment.definitions.shop).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  it("opens in another Studio as a session of its own, shown at once, with its environment", async () => {
    const file = await (
      await post("/api/sessions/file", { name: "Checkout bug", requests: REQUESTS })
    ).json();

    const refused = await post("/api/sessions/import", { file });
    const opened = await (await post("/api/sessions/import", { file }, true)).json();
    const loaded = await (await post("/api/sessions/load", { id: opened.id }, true)).json();

    expect(refused.status).toBe(401);
    expect(opened.name).toBe("Checkout bug (opened from a file)");
    expect(loaded.requests[0].variables.password).toBe("[redacted]");
    expect(loaded.environment.definitions.shop).toBe(file.environment.definitions.shop);
    expect(loaded.fromFile).toBe(true);
  });

  it("tells a session opened from a file from one saved here, which keeps its environment too", async () => {
    const saved = await (
      await post("/api/sessions/save", { name: "Mine", requests: REQUESTS }, true)
    ).json();

    const here = await (await post("/api/sessions/load", { id: saved.id }, true)).json();

    expect(here.environment).toMatchObject({ node: process.version });
    expect(here.fromFile).toBeUndefined();
  });

  it("names the environment this Studio runs in, to set beside a file's", async () => {
    const environment = await (await post("/api/sessions/environment", {})).json();

    expect(environment).toMatchObject({ node: process.version, platform: expect.any(String) });
    expect(environment.definitions.shop).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  it("names no Node.js version or platform for a public demo, whose machine is its host's business", () => {
    const named = sessionEnvironment(root, {});
    const demo = sessionEnvironment(root, {}, { host: false });

    expect(named).toMatchObject({ node: process.version });
    expect(demo).not.toHaveProperty("node");
    expect(demo).not.toHaveProperty("platform");
    expect(demo.packages).toEqual(named.packages);
  });

  it("keeps of a file's environment only the strings Studio writes", () => {
    const read = readSessionFile({
      format: SESSION_FILE_FORMAT,
      version: 1,
      environment: { studio: 1, node: "v24.0.0", packages: { zod: "4.1.0", evil: { x: 1 } } },
      session: { name: "n", requests: [] },
    });

    expect(read).toMatchObject({
      environment: { studio: "unknown", node: "v24.0.0", packages: { zod: "4.1.0" } },
    });
    expect("environment" in read && read.environment).not.toHaveProperty("platform");
    expect(JSON.stringify(read)).not.toContain("evil");
  });

  it("shares an opened session on with the environment it was recorded in, named as it was", async () => {
    const recorded = {
      studio: "0.1.0",
      node: "v22.0.0",
      packages: { zod: "3.25.0" },
      definitions: { shop: "sha256:aaaaaaaaaaaaaaaa" },
    };
    const file = await (
      await post("/api/sessions/file", { name: "Checkout bug", requests: REQUESTS })
    ).json();
    const opened = await (
      await post("/api/sessions/import", { file: { ...file, environment: recorded } }, true)
    ).json();

    const sharedOn = await (await post("/api/sessions/file", { id: opened.id })).json();
    const openedAgain = await (await post("/api/sessions/import", { file: sharedOn }, true)).json();

    expect(sharedOn.environment).toEqual(recorded);
    expect(openedAgain.name).toBe("Checkout bug (opened from a file)");
  });

  it("keeps with a saved session the environment it was saved in, not a later one", async () => {
    const saved = await (
      await post("/api/sessions/save", { name: "Before", requests: REQUESTS }, true)
    ).json();
    const before = (await (await post("/api/sessions/environment", {})).json()).definitions.shop;
    writeFileSync(
      join(root, "courier.config.ts"),
      `import { courier, defineApi } from "@noverax/courier/define";
       const { endpoint } = courier();
       export default { sources: { shop: defineApi({ baseURL: "https://shop.example", endpoints: { logout: endpoint.post("logout") } }) } };`,
    );
    const after = await changedDefinition(before);

    const file = await (await post("/api/sessions/file", { id: saved.id })).json();

    expect(after).not.toBe(before);
    expect(file.environment.definitions.shop).toBe(before);
  });

  it("refuses what is not a session file, and a version this Studio does not know", () => {
    expect(readSessionFile({ log: { entries: [] } })).toEqual({
      error: expect.stringContaining("not a Courier session file"),
    });
    expect(readSessionFile({ format: SESSION_FILE_FORMAT, version: 9, session: {} })).toEqual({
      error: expect.stringContaining("version 9"),
    });
    expect(readSessionFile({ format: SESSION_FILE_FORMAT, version: 0.5, session: {} })).toEqual({
      error: expect.stringContaining("version 0.5"),
    });
  });
});
