/**
 * @vitest-environment node
 *
 * `/rsbuild` under Rsbuild's dev server names a page's scripts by their
 * content, as a build does. TanStack Start's pages preload their scripts
 * as modules, and an engine may run a preloaded module again from its
 * memory, whatever the response says — WebKit does, on a reload too — so
 * under a name that never changes, a page loaded after an edit ran the
 * routes from before it. Requires a build of the core and of
 * `@noverax/courier-build` first.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { afterEach, describe, expect, it } from "vitest";

import { courierRoutes } from "../src/rsbuild";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

const catalog = (audit: string) => `import { courier, defineApi } from "@noverax/courier/define";

const { endpoint } = courier();

export const catalog = defineApi({
  name: "catalog",
  baseURL: "https://catalog.example.com",
  endpoints: { profile: endpoint.get("me").expose(), audit: ${audit} },
});
`;

const FILES: Record<string, string> = {
  "package.json": '{ "type": "module" }\n',
  "courier.config.mjs": `import { catalog } from "./src/catalog.mjs";\n\nexport default { sources: { catalog } };\n`,
  "src/catalog.mjs": catalog('endpoint.get("audit")'),
  "src/label.mjs": `export const label = "first";\n`,
  "src/index.mjs": `import { routes } from "@noverax/courier/routes";
import { label } from "./label.mjs";

document.body.dataset.routes = Object.keys(routes.catalog.endpoints).join(",");
document.body.dataset.label = label;
`,
};

let root: string | undefined;
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
  if (root !== undefined) rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  root = undefined;
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  await new Promise((done) => server.close(done));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

/* An app of the files given, the repository's packages its own, served by Rsbuild's dev server with the plugin. */
async function serve(
  output: Record<string, unknown> = {},
  dev: Record<string, unknown> = {},
): Promise<string> {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-tanstack-rsbuild-")));
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
  for (const [path, content] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const port = await freePort();
  const rsbuild = await createRsbuild({
    cwd: root,
    loadEnv: false,
    rsbuildConfig: {
      logLevel: "silent",
      plugins: [courierRoutes()],
      source: { entry: { index: "./src/index.mjs" } },
      output,
      dev,
      server: { host: "127.0.0.1", port, strictPort: true, printUrls: false },
    },
  });
  const server = await rsbuild.startDevServer();
  close = () => server.server.close();
  return `http://127.0.0.1:${port}`;
}

/* The script the page loads, by the address its HTML gives. */
async function script(base: string): Promise<{ address: string; code: string }> {
  const html = await (await fetch(`${base}/`)).text();
  const address = /<script[^>]*src="([^"]+\.js)"/.exec(html)?.[1];
  if (address === undefined) throw new Error(`the page names no script: ${html}`);
  return { address, code: await (await fetch(`${base}${address}`)).text() };
}

/* The page's script once the dev server has built an edit in: under another address than before,
   and holding what the edit wrote. */
async function rebuilt(
  base: string,
  before: string,
  mark: string,
): Promise<{ address: string; code: string }> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const now = await script(base);
    if ((now.address !== before && now.code.includes(mark)) || Date.now() > deadline) return now;
    await new Promise((done) => setTimeout(done, 200));
  }
}

describe("courierRoutes from /rsbuild, under Rsbuild's dev server", () => {
  it("names a page's script by its content, so an edit of the routes gives it a new address", async () => {
    const base = await serve();
    const first = await script(base);

    writeFileSync(join(root ?? "", "src/catalog.mjs"), catalog('endpoint.get("audit").expose()'));
    const second = await rebuilt(base, first.address, "audit");

    expect(first.address).toMatch(/^\/static\/js\/index\.[0-9a-f]{10}\.js$/);
    expect(first.code).not.toContain("audit");
    expect(second.address).not.toBe(first.address);
    expect(second.code).toContain("audit");
  }, 60_000);

  /* As Rsbuild forgets them in memory: the scripts of the last two builds stay, for a page a build behind. */
  it("leaves on disk, where the dev server writes there, the scripts of no more than two builds", async () => {
    const base = await serve({}, { writeToDisk: true });
    const scripts = join(root ?? "", "dist/static/js");
    let address = (await script(base)).address;

    for (let edit = 1; edit <= 50; edit++) {
      writeFileSync(join(root ?? "", "src/label.mjs"), `export const label = "edit ${edit}";\n`);
      const now = await rebuilt(base, address, `edit ${edit}`);
      expect(now.code).toContain(`edit ${edit}`);
      address = now.address;
    }

    const written = readdirSync(scripts).filter((name) => /^index\..*\.js$/.test(name));
    expect(written).toContain(address.slice("/static/js/".length));
    expect(written.length).toBeLessThanOrEqual(2);
  }, 240_000);

  it("keeps the names an app gives its scripts itself", async () => {
    const base = await serve({ filename: { js: "[name].js" } });

    expect((await script(base)).address).toBe("/static/js/index.js");
  }, 60_000);
});
