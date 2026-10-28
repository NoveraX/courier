/**
 * @vitest-environment node
 *
 * The routes plugin in a project's own Vitest, run as a process of its own
 * as a project runs it: a test gets the routes under Node and under jsdom,
 * and in watch mode an edit to a definition reruns the test that imports
 * them, with the new routes rather than the ones Vitest kept from the run
 * before. Requires a build of this package and of the core first.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { APIS, CONFIG, type TempProject, tempProject } from "./temp-project";

const PLUGIN = resolve(import.meta.dirname, "../../lib/vite/index.js");

const VITEST_CONFIG = `import { defineConfig } from "vitest/config";
import { courierRoutes } from ${JSON.stringify(PLUGIN)};

export default defineConfig({ plugins: [courierRoutes()], test: { include: ["src/**/*.test.ts"] } });
`;

const SHOP_PATHS = `import { routes } from "@noverax/courier/routes";

export const shopPaths = (): string[] => Object.keys(routes.shop?.endpoints ?? {});
`;

/* Each run writes the paths it saw, so a rerun's are read off the disk. */
const NODE_TEST = `import { appendFileSync } from "node:fs";
import { expect, it } from "vitest";
import { shopPaths } from "./shop-paths";

it("sees the routes the config opens", () => {
  appendFileSync("seen.log", \`\${shopPaths().join(",")}\\n\`);
  expect(shopPaths()).toContain("cart.add");
});
`;

const DOM_TEST = `// @vitest-environment jsdom
import { expect, it } from "vitest";
import { shopPaths } from "./shop-paths";

it("sees them under jsdom too", () => {
  expect(typeof document).toBe("object");
  expect(shopPaths()).toContain("cart.add");
});
`;

let project: TempProject | undefined;
let vitest: ChildProcess | undefined;

afterEach(async () => {
  if (vitest !== undefined && vitest.exitCode === null && vitest.signalCode === null) {
    const exited = new Promise((ended) => vitest?.once("exit", ended));
    vitest.kill();
    await exited;
  }
  vitest = undefined;
  project?.remove();
  project = undefined;
});

function vitestProject(): TempProject {
  return tempProject({
    "courier.config.ts": CONFIG,
    "src/apis.ts": APIS,
    "src/shop-paths.ts": SHOP_PATHS,
    "src/shop-paths.test.ts": NODE_TEST,
    "src/dom.test.ts": DOM_TEST,
    "vitest.config.ts": VITEST_CONFIG,
  });
}

function runVitest(root: string, args: string[]): { child: ChildProcess; output: () => string } {
  let output = "";
  const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", ...args], {
    cwd: root,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

function seen(root: string): string[] {
  const log = join(root, "seen.log");
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
}

describe("courierRoutes in a project's Vitest", () => {
  it("gives a test the routes under Node and under jsdom", async () => {
    project = vitestProject();
    const run = runVitest(project.root, ["run"]);
    vitest = run.child;

    const code = await new Promise((ended) => run.child.once("exit", ended));

    expect(run.output()).toMatch(/Tests\s+2 passed/);
    expect(code).toBe(0);
  }, 120_000);

  it("reruns a test that imports the routes with the new routes once a definition changes", async () => {
    project = vitestProject();
    const root = project.root;
    vitest = runVitest(root, ["--watch", "src/shop-paths.test.ts"]).child;
    await expect.poll(() => seen(root), { timeout: 60_000 }).toEqual(["cart.add"]);

    project.edit("src/apis.ts", (apis) =>
      apis.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()'),
    );

    await expect.poll(() => seen(root).at(-1), { timeout: 30_000 }).toBe("cart.add,cart.view");
  }, 120_000);
});
