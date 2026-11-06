/**
 * @vitest-environment node
 *
 * Which of the core's two sides Jest loads, by the conditions its test
 * environment names. Under the node environment, the server's: a part a
 * server lends in a test is read by the calls of its process. Under the
 * browser condition — the one Jest's jsdom environment names unless told
 * otherwise — the page's, whose registry reads no slot: server code under
 * test runs in the node environment. Requires a build of the core first.
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

describe("Jest", () => {
  it("loads the server's side under the node environment", () => {
    expect(sideUnder()).toBe("server");
  }, 120_000);

  it("loads the page's side under the browser condition, as its jsdom environment names it", () => {
    expect(sideUnder(["browser"])).toBe("page");
  }, 120_000);
});
