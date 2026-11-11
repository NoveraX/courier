/**
 * @vitest-environment node
 *
 * Which of the core's two sides Jest loads, by the conditions its test
 * environment names. Under the node environment, the server's: a part a
 * server lends in a test is read by the calls of its process. Under the
 * browser condition — the one Jest's jsdom environment names unless told
 * otherwise — the page's, whose registry reads no slot: server code under
 * test runs in the node environment. The root's caller is a page's there;
 * the caller of `@noverax/courier/server` is the server's or none, refused
 * as it is made rather than sent with the page's session, and so it is
 * under Node's own `--conditions=browser`. Requires a build of the core
 * first.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { type TempProject, tempProject } from "../vite/temp-project";

const require = createRequire(import.meta.url);

const JEST = join(dirname(require.resolve("jest/package.json")), "bin/jest.js");

/* The root's caller lends the server's session as it is made: the server's side keeps it on the
   global object, the page's keeps it to itself. */
const SIDE = `import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";

test("side", () => {
  const { endpoint } = courier();
  createCaller(defineApi({ name: "a", baseURL: "https://api.example.com", endpoints: { me: endpoint.get("me") } }));
  const lent = globalThis[Symbol.for("courier.serverCapabilities.v1")] !== undefined;
  console.log("SIDE " + (lent ? "server" : "page"));
});
`;

/* A page's DOM on the global object, as jsdom puts it there, the page's session in its cookies, and
   an API on the page's site that keeps a session: what each caller sends it, or why it refuses. */
const CALLS = `import { createCaller } from "@noverax/courier/server";
import { createCaller as createPageCaller } from "@noverax/courier/client";
import { courier, defineApi } from "@noverax/courier/define";

globalThis.window = globalThis;
globalThis.document = { cookie: "sid=made-up-page-session; csrftoken=made-up-page-token" };
const { endpoint } = courier();
const sent = [];
const api = defineApi({
  name: "accounts",
  baseURL: "https://app.example.test/api",
  session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
  fetch: async (_input, init) => {
    sent.push(init ?? {});
    return Response.json({});
  },
  endpoints: { rename: endpoint.post("me/name") },
});

export async function tell(label, make) {
  sent.length = 0;
  try {
    await make().rename();
    const init = sent.at(-1) ?? {};
    console.log(label + " sent " + init.credentials + " " + new Headers(init.headers).get("x-csrftoken"));
  } catch (error) {
    console.log(label + " refused " + error.code + " " + sent.length);
  }
}

export const server = () => createCaller(api);
export const page = () => createPageCaller(api);
`;

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* The side a test loads under the node environment, given the conditions it names, if any. */
function sideUnder(conditions?: readonly string[]): string | undefined {
  const options = conditions
    ? `testEnvironmentOptions: { customExportConditions: ${JSON.stringify(conditions)} },`
    : "";
  project = tempProject({
    "jest.config.cjs": `module.exports = { testEnvironment: "node", ${options} cacheDirectory: "<rootDir>/.jest-cache" };\n`,
    "tests/side.test.mjs": SIDE,
  });
  const run = spawnSync(
    process.execPath,
    [JEST, "--rootDir", project.root, "--ci", "tests/side.test.mjs"],
    {
      cwd: project.root,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--experimental-vm-modules" },
    },
  );
  return /SIDE (\w+)/.exec(`${run.stdout}${run.stderr}`)?.[1];
}

/* What the caller of `@noverax/courier/server` and the page's caller each did, under the
   conditions Jest's environment names, if any. */
function callsUnder(conditions?: readonly string[]): string[] {
  const options = conditions
    ? `testEnvironmentOptions: { customExportConditions: ${JSON.stringify(conditions)} },`
    : "";
  project = tempProject({
    "jest.config.cjs": `module.exports = { testEnvironment: "node", ${options} cacheDirectory: "<rootDir>/.jest-cache" };\n`,
    "tests/calls.mjs": CALLS,
    "tests/calls.test.mjs": `import { page, server, tell } from "./calls.mjs";\ntest("calls", async () => {\n  await tell("SERVER", server);\n  await tell("PAGE", page);\n});\n`,
  });
  const run = spawnSync(
    process.execPath,
    [JEST, "--rootDir", project.root, "--ci", "tests/calls.test.mjs"],
    {
      cwd: project.root,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--experimental-vm-modules" },
    },
  );
  return [
    ...`${run.stdout}${run.stderr}`.matchAll(/(?:SERVER|PAGE) (?:sent|refused) \S+ \S+/g),
  ].map((found) => found[0]);
}

describe("Jest", () => {
  it("loads the server's side under the node environment", () => {
    expect(sideUnder()).toBe("server");
  }, 120_000);

  it("loads the page's side under the browser condition, as its jsdom environment names it", () => {
    expect(sideUnder(["browser"])).toBe("page");
  }, 120_000);

  it("refuses the server's caller under the browser condition, and the page's keeps the page's session", () => {
    expect(callsUnder(["browser"])).toEqual([
      "SERVER refused SERVER_CAPABILITY_MISSING 0",
      "PAGE sent include made-up-page-token",
    ]);
  }, 120_000);

  it("sends the server's caller with none of the page's session under the node environment", () => {
    expect(callsUnder()).toEqual(["SERVER sent omit null", "PAGE sent include made-up-page-token"]);
  }, 120_000);
});

describe("Node with the browser condition", () => {
  it("refuses the server's caller, and the page's keeps the page's session", () => {
    project = tempProject({
      "calls.mjs": CALLS,
      "run.mjs": `import { page, server, tell } from "./calls.mjs";\nawait tell("SERVER", server);\nawait tell("PAGE", page);\n`,
    });
    const run = spawnSync(process.execPath, ["--conditions=browser", "run.mjs"], {
      cwd: project.root,
      encoding: "utf8",
    });

    expect(
      [...`${run.stdout}${run.stderr}`.matchAll(/(?:SERVER|PAGE) (?:sent|refused) \S+ \S+/g)].map(
        (found) => found[0],
      ),
    ).toEqual([
      "SERVER refused SERVER_CAPABILITY_MISSING 0",
      "PAGE sent include made-up-page-token",
    ]);
  }, 120_000);
});
