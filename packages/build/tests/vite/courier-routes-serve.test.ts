/**
 * @vitest-environment node
 *
 * The routes plugin under Vite's dev server: a page and a server rendering
 * it get the routes; an edit to a definition they came from serves them
 * anew without a restart; a config that breaks leaves the routes read last
 * in force until it is mended; and with no config yet, the module fails
 * with why until one is saved. An entry added to a folder the config lists
 * serves them anew too, however soon after the routes were served.
 * Requires a build of this package and of the core first.
 */
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createLogger, createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { ROUTES_MODULE_ID } from "../../src/util/routes-module-id";
import { courierRoutes } from "../../src/vite/courier-routes";
import { APIS, CONFIG, type TempProject, tempProject } from "./temp-project";

const ENTRY = `export { routes } from "@noverax/courier/routes";\n`;

let project: TempProject | undefined;
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  project?.remove();
  project = undefined;
});

/* The errors the dev server logged, the plugin's among them. */
const logged: string[] = [];

async function serve(root: string, preserveSymlinks = false): Promise<ViteDevServer> {
  logged.length = 0;
  const logger = createLogger("silent");
  return createServer({
    root,
    configFile: false,
    resolve: { preserveSymlinks },
    customLogger: { ...logger, error: (message) => logged.push(message) },
    server: { middlewareMode: true, ws: false },
    plugins: [courierRoutes()],
  });
}

/* A config that serves the payments too once its folder of switches holds `payments`. */
function switchedConfig(root: string): string {
  return `import { readdirSync } from "node:fs";
import { payments, shop } from "./src/apis";

const switches = readdirSync(${JSON.stringify(`${root}/switches`)});
export default { sources: switches.includes("payments") ? { shop, payments } : { shop } };
`;
}

/* The names of the sources whose routes a server rendering the page gets now. */
async function sourcesOf(dev: ViteDevServer): Promise<string[]> {
  const loaded: Record<string, unknown> = await dev.ssrLoadModule("/src/entry.ts");
  return Object.keys((loaded.routes as object | undefined) ?? {});
}

/**
 * Keep `path` from the dev server's watcher, whenever it is handed over,
 * until the call returned hands it on, as a busy machine takes it late:
 * the watcher reads it then as it is by that time. Every other path, and
 * chokidar's own calls, go through as they come.
 */
function handOverLate(dev: ViteDevServer, path: string): () => void {
  const { watcher } = dev;
  const add = watcher.add;
  const late: string[] = [];
  watcher.add = (paths: string | readonly string[], ...rest: unknown[]) => {
    const all = [paths].flat();
    const now = all.filter((each) => each !== path);
    if (now.length < all.length) late.push(path);
    return now.length === 0 ? watcher : Reflect.apply(add, watcher, [now, ...rest]);
  };
  return () => {
    if (late.length > 0) Reflect.apply(add, watcher, [late.splice(0)]);
  };
}

/* The paths of the shop's routes a server rendering the page gets now. */
async function shopPaths(dev: ViteDevServer): Promise<string[]> {
  const loaded: Record<string, unknown> = await dev.ssrLoadModule("/src/entry.ts");
  const routes = loaded.routes as Record<string, { endpoints: object }> | undefined;
  return Object.keys(routes?.shop?.endpoints ?? {});
}

function exposeView(content: string): string {
  return content.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()');
}

describe("courierRoutes under the dev server", () => {
  it("serves the routes to a page and to a server rendering it", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/entry.ts": ENTRY,
    });
    server = await serve(project.root);

    const page = await server.environments.client.transformRequest(ROUTES_MODULE_ID);

    expect(page?.code).toContain('"cart.add"');
    expect(await shopPaths(server)).toEqual(["cart.add"]);
  }, 60_000);

  it("serves them anew once a definition they came from changes, without a restart", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/entry.ts": ENTRY,
    });
    server = await serve(project.root);
    const dev = server;
    await shopPaths(dev);

    project.edit("src/apis.ts", exposeView);

    await expect.poll(() => shopPaths(dev), { timeout: 20_000 }).toEqual(["cart.add", "cart.view"]);
  }, 60_000);

  it("keeps the routes read last while the config is broken, and reads them once it is mended", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/entry.ts": ENTRY,
    });
    server = await serve(project.root);
    const dev = server;
    await shopPaths(dev);

    project.edit("courier.config.ts", (config) => `${config}\nthrow new Error("broken");\n`);
    let whileBroken: string[] = [];
    await expect
      .poll(
        async () => {
          whileBroken = await shopPaths(dev);
          return logged.join("\n");
        },
        { timeout: 20_000 },
      )
      .toMatch(/\[courier\] courier\.config\.ts did not load.*broken/);
    project.edit("src/apis.ts", exposeView);
    project.edit("courier.config.ts", () => CONFIG);

    expect(whileBroken).toEqual(["cart.add"]);
    await expect.poll(() => shopPaths(dev), { timeout: 20_000 }).toEqual(["cart.add", "cart.view"]);
  }, 60_000);

  it("serves them anew once a file the config reads changes, or a folder it lists gains an entry", async () => {
    project = tempProject({ "src/apis.ts": APIS, "src/entry.ts": ENTRY, "flags.json": "{}\n" });
    const root = project.root;
    project.write(
      "courier.config.ts",
      `import { existsSync, readdirSync, readFileSync } from "node:fs";
import { payments, shop } from "./src/apis";

const flags = JSON.parse(readFileSync(${JSON.stringify(`${root}/flags.json`)}, "utf8"));
const switches = existsSync(${JSON.stringify(`${root}/switches`)}) ? readdirSync(${JSON.stringify(`${root}/switches`)}) : [];
export default { sources: flags.payments || switches.includes("payments") ? { shop, payments } : { shop } };
`,
    );
    project.write("switches/.keep", "");
    server = await serve(root);
    const dev = server;
    const sources = async (): Promise<string[]> => {
      const loaded: Record<string, unknown> = await dev.ssrLoadModule("/src/entry.ts");
      return Object.keys((loaded.routes as object | undefined) ?? {});
    };
    expect(await sources()).toEqual(["shop"]);

    project.edit("flags.json", () => '{ "payments": true }\n');
    await expect.poll(sources, { timeout: 20_000 }).toEqual(["payments", "shop"]);
    project.edit("flags.json", () => "{}\n");
    await expect.poll(sources, { timeout: 20_000 }).toEqual(["shop"]);
    project.write("switches/payments", "");

    await expect.poll(sources, { timeout: 20_000 }).toEqual(["payments", "shop"]);
  }, 90_000);

  it("serves them anew once a folder the config lists gains an entry, in a project opened through a link", async () => {
    project = tempProject({ "src/apis.ts": APIS, "src/entry.ts": ENTRY, "switches/.keep": "" });
    const root = project.root;
    project.write("courier.config.ts", switchedConfig(root));
    const link = `${root}-link`;
    symlinkSync(root, link, "dir");
    try {
      /* Vite keeps the link: its watcher follows the project by the link's path, while the
         config names the folder by its real one. The folder reaches the watcher, if it is
         handed it, only once the entry is made: a plugin that waited for it would miss it. */
      server = await serve(link, true);
      const dev = server;
      const sources = () => sourcesOf(dev);
      const handOver = handOverLate(dev, join(root, "switches"));
      expect(await sources()).toEqual(["shop"]);

      project.write("switches/payments", "");
      handOver();

      await expect.poll(sources, { timeout: 20_000 }).toEqual(["payments", "shop"]);
    } finally {
      rmSync(link);
    }
  }, 90_000);

  /* chokidar reads a folder it is handed as one just added: an entry made before
     it read the folder would pass for one that was there, and no notice of it
     would follow. Each system watches as it does by default, macOS with FSEvents:
     there `fs.watch` follows every folder through one FSEvents stream, which it
     starts anew for each folder added, and drops a notice that comes meanwhile. */
  it("serves them anew once a folder the config lists gains an entry as the watcher is handed it", async () => {
    project = tempProject({ "src/apis.ts": APIS, "src/entry.ts": ENTRY, "switches/.keep": "" });
    const root = project.root;
    project.write("courier.config.ts", switchedConfig(root));
    server = await serve(root);
    const dev = server;
    const sources = () => sourcesOf(dev);
    /* Vite's watcher follows the folder already, as it follows the whole root. */
    await expect
      .poll(() => dev.watcher.getWatched()[root]?.includes("switches"), { timeout: 20_000 })
      .toBe(true);
    const handOver = handOverLate(dev, join(root, "switches"));
    expect(await sources()).toEqual(["shop"]);

    project.write("switches/payments", "");
    handOver();

    await expect.poll(sources, { timeout: 20_000 }).toEqual(["payments", "shop"]);
  }, 90_000);

  it("serves a module that fails with why while there is no config, and the routes once one is saved", async () => {
    project = tempProject({ "src/apis.ts": APIS, "src/entry.ts": ENTRY });
    server = await serve(project.root);
    const dev = server;

    await expect(shopPaths(dev)).rejects.toThrow(/\[courier\] No courier\.config\.\* in/);
    project.write("courier.config.ts", CONFIG);

    await expect
      .poll(() => shopPaths(dev).catch(() => []), { timeout: 20_000 })
      .toEqual(["cart.add"]);
  }, 60_000);
});
