/**
 * @vitest-environment node
 *
 * `ng serve` with Courier's dev-server builder: the page it serves runs the
 * routes of the config, and an edit that opens an endpoint reaches it
 * without a restart. Requires a build of this package, of
 * `@noverax/courier-build` and of the core first.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { ADD_OPEN, type AngularProject, angularProject, VIEW_OPEN } from "./angular-project";

const NG = join(
  dirname(createRequire(import.meta.url).resolve("@angular/cli/package.json")),
  "bin/ng.js",
);

let project: AngularProject | undefined;
let server: ChildProcess | undefined;

afterEach(async () => {
  await stop(server);
  server = undefined;
  project?.remove();
  project = undefined;
});

/* Until the dev server has ended: Windows removes no folder a running process holds files in. */
async function stop(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise((settle) => child.once("exit", settle));
  child.kill();
  await ended;
}

/* A port no one listens on. */
function freePort(): Promise<number> {
  return new Promise((settle, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address !== null
          ? settle(address.port)
          : fail(new Error("no port")),
      );
    });
  });
}

/* The dev server of the project, once it says where it serves. */
async function serve(root: string): Promise<string> {
  const port = await freePort();
  const started = spawn(
    process.execPath,
    [NG, "serve", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: { ...process.env, NG_CLI_ANALYTICS: "false", CI: "1" },
    },
  );
  server = started;
  let output = "";
  await new Promise<void>((settle, fail) => {
    const timer = setTimeout(() => fail(new Error(`ng serve did not start:\n${output}`)), 120_000);
    const take = (chunk: Buffer): void => {
      output += chunk.toString();
      /* Coloured where CI says it shows colours: `Local` and its colon apart. */
      if (!/Local:/.test(stripVTControlCharacters(output))) return;
      clearTimeout(timer);
      settle();
    };
    started.stdout?.on("data", take);
    started.stderr?.on("data", take);
    started.once("exit", () => fail(new Error(`ng serve ended:\n${output}`)));
  });
  return `http://127.0.0.1:${port}`;
}

/* The code of the page's main script, as the dev server serves it now. */
async function mainScript(address: string): Promise<string> {
  const response = await fetch(`${address}/main.js`);
  return (await response.text()).replace(/\s/g, "");
}

describe("ng serve with Courier's dev-server builder", () => {
  it("serves the routes, and an edit that opens an endpoint reaches the page without a restart", async () => {
    project = angularProject();
    const address = await serve(project.root);

    await expect.poll(() => mainScript(address), { timeout: 60_000 }).toMatch(ADD_OPEN);
    project.edit("src/apis.ts", (code) =>
      code.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()'),
    );

    await expect.poll(() => mainScript(address), { timeout: 60_000 }).toMatch(VIEW_OPEN);
  }, 240_000);
});
