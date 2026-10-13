/**
 * A caller without the project's token is told no path of this machine: an
 * error answer names a file of the project relative to it, and any other
 * file under the home directory from `~` — however the route sent it — and
 * an answer that succeeded does so wherever it says what went wrong. The
 * developer, with the token, is told paths as they are.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express-serve-static-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hideMachinePaths } from "../src/server/hide-machine-paths";
import { studioApp } from "../src/server/studio-app";
import type { StudioToken } from "../src/server/studio-token";
import { TOKEN_HEADER } from "../src/server/token-guard";

const ROOT = "/Users/ana/work/shop";
const FILE = `${ROOT}/specs/x.yaml`;
const NPM = "/Users/ana/.npm/_npx/1/node_modules/x/index.js";
const TOKEN: StudioToken = {
  value: "t".repeat(43),
  matches: (presented) => presented === "t".repeat(43),
};

const ANSWERS: Record<string, (res: Response) => void> = {
  fails: (res) => {
    res.status(400).json({
      error: `ENOENT: no such file or directory, realpath '${FILE}'`,
      context: { module: NPM, tried: [[FILE]] },
      files: { [FILE]: "missing" },
    });
  },
  "fails-with-error": (res) => {
    res
      .status(500)
      .json({ error: "x", detail: Object.assign(new Error(`open '${FILE}'`), { path: FILE }) });
  },
  "fails-as-text": (res) => {
    res.status(400).send(`ENOENT, open '${FILE}'`);
  },
  "fails-as-json-by-hand": (res) => {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: `open '${FILE}'` }));
  },
  "fails-as-bytes": (res) => {
    res.status(500).type("bin").send(Buffer.from(FILE));
  },
  formats: (res) => {
    res.json({
      files: [{ path: `${ROOT}/src/api/index.ts`, content: "export {};" }],
      formatting: { formattedWith: null, problem: `Prettier failed on ${ROOT}/src/api/index.ts` },
      checks: [{ pets: { deeper: { error: `open '${FILE}'` } } }],
    });
  },
  "lists-failures": (res) => {
    res.json([
      { name: "a", error: `open '${FILE}'` },
      { name: "b", result: Object.assign(new Error("gone"), { path: NPM }) },
    ]);
  },
  "succeeds-as-text": (res) => {
    res.send(`see ${FILE}`);
  },
};

let server: Server | undefined;
let base = "";

beforeEach(async () => {
  const app = studioApp();
  app.use("/api", hideMachinePaths(TOKEN, { project: [ROOT], home: "/Users/ana" }));
  /* Mounted as Express mounts any handler, so each answers with all of Express's response. */
  for (const [name, answer] of Object.entries(ANSWERS)) {
    app.use(`/api/${name}`, (_req: Request, res: Response) => answer(res));
  }
  server = createServer(app);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

async function post(path: string, token?: string): Promise<globalThis.Response> {
  return call("POST", path, token);
}

async function call(method: string, path: string, token?: string): Promise<globalThis.Response> {
  const headers: Record<string, string> = token === undefined ? {} : { [TOKEN_HEADER]: token };
  return fetch(`${base}${path}`, { method, headers });
}

async function json(path: string, token?: string): Promise<unknown> {
  return (await post(path, token)).json();
}

describe("an error answer to a caller without the token", () => {
  it("names a file of the project relative to it and any other under ~, in every string and key", async () => {
    expect(await json("/api/fails")).toEqual({
      error: "ENOENT: no such file or directory, realpath 'specs/x.yaml'",
      context: { module: "~/.npm/_npx/1/node_modules/x/index.js", tried: [["specs/x.yaml"]] },
      files: { "specs/x.yaml": "missing" },
    });
  });

  it("takes the paths out of an Error's own fields, as JSON sends them", async () => {
    expect(await json("/api/fails-with-error")).toEqual({
      error: "x",
      detail: { path: "specs/x.yaml" },
    });
  });

  it("takes the paths out of a text, with its length told anew", async () => {
    const answer = await post("/api/fails-as-text");
    const text = await answer.text();

    expect(text).toBe("ENOENT, open 'specs/x.yaml'");
    expect(answer.headers.get("content-length")).toBe(String(Buffer.byteLength(text)));
    expect(answer.headers.get("etag")).toBeNull();
  });

  it.each(["/api/fails", "/api/fails-as-text"])(
    "tells HEAD %s the length of the body GET is sent, and no tag",
    async (path) => {
      const sent = await (await call("GET", path)).text();

      const head = await call("HEAD", path);

      expect(head.status).toBeGreaterThanOrEqual(400);
      expect(head.headers.get("content-length")).toBe(String(Buffer.byteLength(sent)));
      expect(head.headers.get("etag")).toBeNull();
      expect(sent).not.toContain(ROOT);
    },
  );

  it("sends JSON it rewrote with no tag", async () => {
    const answer = await post("/api/fails");

    expect(answer.headers.get("etag")).toBeNull();
  });

  it("tells HEAD the length of the body as it is to a caller with the token", async () => {
    const head = await call("HEAD", "/api/fails-as-text", TOKEN.value);

    expect(head.headers.get("content-length")).toBe(
      String(Buffer.byteLength(`ENOENT, open '${FILE}'`)),
    );
  });

  it("takes the paths out of JSON a route wrote by hand, as its values", async () => {
    expect(await json("/api/fails-as-json-by-hand")).toEqual({ error: "open 'specs/x.yaml'" });
  });

  it("leaves bytes that are not text as they are", async () => {
    expect(await (await post("/api/fails-as-bytes")).text()).toBe(FILE);
  });

  it("names paths as they are to a caller with the token", async () => {
    expect(await json("/api/fails", TOKEN.value)).toEqual({
      error: `ENOENT: no such file or directory, realpath '${FILE}'`,
      context: { module: NPM, tried: [[FILE]] },
      files: { [FILE]: "missing" },
    });
    expect(await (await post("/api/fails-as-text", TOKEN.value)).text()).toBe(
      `ENOENT, open '${FILE}'`,
    );
  });
});

describe("an answer that succeeded, to a caller without the token", () => {
  it("has the paths taken out of what it says went wrong, at any depth, and of nothing else", async () => {
    expect(await json("/api/formats")).toEqual({
      files: [{ path: `${ROOT}/src/api/index.ts`, content: "export {};" }],
      formatting: { formattedWith: null, problem: "Prettier failed on src/api/index.ts" },
      checks: [{ pets: { deeper: { error: "open 'specs/x.yaml'" } } }],
    });
  });

  it("has them taken out of a list it is, and of an Error it holds", async () => {
    const answer = await json("/api/lists-failures");

    expect(answer).toEqual([
      { name: "a", error: "open 'specs/x.yaml'" },
      { name: "b", result: { path: "~/.npm/_npx/1/node_modules/x/index.js" } },
    ]);
  });

  it("is otherwise sent as the route sent it", async () => {
    expect(await (await post("/api/succeeds-as-text")).text()).toBe(`see ${FILE}`);
  });
});
