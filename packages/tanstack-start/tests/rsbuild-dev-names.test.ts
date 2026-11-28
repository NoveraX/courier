/**
 * @vitest-environment node
 *
 * `/rsbuild` under Rsbuild's dev server leaves a page's scripts the names
 * the dev server gives them. Since its releases of 19 November 2026,
 * TanStack Start's dev server renders every page with the scripts of the
 * first build it made: under names by content, a script an edit renamed was
 * gone from the dev server two builds later, and the page it rendered ran
 * none of its code. Requires a build of the core and of
 * `@noverax/courier-build` first.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
async function serve(): Promise<string> {
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

/* What the dev server answers at an address once it serves what an edit wrote there, or what it
   last answered after 20 seconds. */
async function serving(
  base: string,
  address: string,
  mark: string,
): Promise<{ status: number; code: string }> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const response = await fetch(`${base}${address}`);
    const now = { status: response.status, code: await response.text() };
    if (now.code.includes(mark) || Date.now() > deadline) return now;
    await new Promise((done) => setTimeout(done, 200));
  }
}

describe("courierRoutes from /rsbuild, under Rsbuild's dev server", () => {
  /* A page rendered with the scripts of the first build, as TanStack Start's dev server renders it. */
  it("serves each edit at the address the first build gave the page's script", async () => {
    const base = await serve();
    const first = await script(base);

    writeFileSync(join(root ?? "", "src/catalog.mjs"), catalog('endpoint.get("audit").expose()'));
    const opened = await serving(base, first.address, "audit");
    writeFileSync(join(root ?? "", "src/label.mjs"), `export const label = "second";\n`);
    const relabelled = await serving(base, first.address, '"second"');

    expect(first.code).not.toContain("audit");
    expect(opened.status).toBe(200);
    expect(opened.code).toContain("audit");
    expect(relabelled.status).toBe(200);
    expect(relabelled.code).toContain("audit");
    expect(relabelled.code).toContain('"second"');
    expect((await script(base)).address).toBe(first.address);
  }, 60_000);
});
