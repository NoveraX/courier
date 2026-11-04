/**
 * @vitest-environment node
 *
 * The routes plugin brings the routes back once what broke them is mended:
 * a module the config imports, whether routes were read before or not; a
 * config saved above Vite's root, where a Nuxt 4 app's root is `app/`; a
 * build that watches; and each dev server the plugin serves is told why
 * they broke. Requires a build of this package and of the core first.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  build,
  createLogger,
  createServer,
  type Plugin,
  type Rollup,
  type ViteDevServer,
} from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { courierRoutes } from "../../src/vite/courier-routes";
import { APIS, CONFIG, type TempProject, tempProject } from "./temp-project";

const ENTRY = `export { routes } from "@noverax/courier/routes";\n`;

/* A config that also opens what a billing module defines: the module that breaks and is mended. */
const BILLING = `import { courier, defineApi } from "@noverax/courier/define";

const { endpoint } = courier();

export const billing = defineApi({
  baseURL: "https://billing.example.com",
  endpoints: { invoices: endpoint.get("invoices").expose() },
});
`;
const CONFIG_WITH_BILLING = `import { billing } from "./src/billing";
import { payments, shop } from "./src/apis";

export default { sources: { shop, payments, billing } };
`;

let project: TempProject | undefined;
const servers: ViteDevServer[] = [];
let watcher: Rollup.RollupWatcher | undefined;

afterEach(async () => {
  logged.length = 0;
  for (const server of servers.splice(0)) await server.close();
  await watcher?.close();
  watcher = undefined;
  project?.remove();
  project = undefined;
});

/* The errors the dev servers logged, the plugin's among them. */
const logged: string[] = [];

async function serve(
  root: string,
  plugin: Plugin = courierRoutes(),
  watch?: { useFsEvents: boolean; usePolling: boolean },
): Promise<ViteDevServer> {
  const logger = createLogger("silent");
  const server = await createServer({
    root,
    configFile: false,
    customLogger: { ...logger, error: (message) => logged.push(message) },
    server: { middlewareMode: true, ws: false, ...(watch === undefined ? {} : { watch }) },
    plugins: [plugin],
  });
  servers.push(server);
  return server;
}

/* The sources a server rendering the page gets now, or why it gets none. */
async function sources(dev: ViteDevServer, entry = "/src/entry.ts"): Promise<string> {
  try {
    const loaded: Record<string, unknown> = await dev.ssrLoadModule(entry);
    return Object.keys((loaded.routes as object | undefined) ?? {}).join(",");
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("courierRoutes once what broke the routes is mended", () => {
  it("reads them again once a module the config newly imports is mended", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/entry.ts": ENTRY,
    });
    const dev = await serve(project.root);
    expect(await sources(dev)).toBe("payments,shop");

    project.write("src/billing.ts", `${BILLING}\nthrow new Error("billing is broken");\n`);
    project.edit("courier.config.ts", () => CONFIG_WITH_BILLING);
    await expect
      .poll(async () => `${await sources(dev)} ${logged.join("\n")}`, { timeout: 20_000 })
      .toMatch(/^payments,shop .*billing is broken/s);
    project.edit("src/billing.ts", () => BILLING);

    await expect.poll(() => sources(dev), { timeout: 20_000 }).toBe("billing,payments,shop");
  }, 60_000);

  it("reads them once a module the config imports is mended, with none read before", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG_WITH_BILLING,
      "src/apis.ts": APIS,
      "src/billing.ts": `${BILLING}\nthrow new Error("billing is broken");\n`,
      "src/entry.ts": ENTRY,
    });
    const dev = await serve(project.root);
    expect(await sources(dev)).toMatch(/failed: .*billing is broken/);

    project.edit("src/billing.ts", () => BILLING);

    await expect.poll(() => sources(dev), { timeout: 20_000 }).toBe("billing,payments,shop");
  }, 60_000);

  it("reads them once a config is saved above Vite's root, as a Nuxt 4 app's is", async () => {
    project = tempProject({ "src/apis.ts": APIS, "app/entry.ts": ENTRY });
    const dev = await serve(join(project.root, "app"));
    expect(await sources(dev, "/entry.ts")).toMatch(/failed: .*No courier\.config\.\* in/);

    project.write("courier.config.ts", CONFIG);

    await expect.poll(() => sources(dev, "/entry.ts"), { timeout: 20_000 }).toBe("payments,shop");
  }, 60_000);

  /* Vite's chokidar reads a folder it was handed missing files in for the first of them
     alone, whether the system tells it of a change, as Linux and Windows do, or it polls. */
  it.each([
    ["as Linux and Windows tell of it", { useFsEvents: false, usePolling: false }],
    ["as a watcher that polls finds it", { useFsEvents: false, usePolling: true }],
  ])(
    "reads them once a config is saved above Vite's root under a later name, %s",
    async (_how, watch) => {
      project = tempProject({ "src/apis.ts": APIS, "app/entry.ts": ENTRY });
      const dev = await serve(join(project.root, "app"), courierRoutes(), watch);
      expect(await sources(dev, "/entry.ts")).toMatch(/failed: .*No courier\.config\.\* in/);

      project.write("courier.config.mts", CONFIG);

      await expect.poll(() => sources(dev, "/entry.ts"), { timeout: 20_000 }).toBe("payments,shop");
    },
    60_000,
  );

  it("reads them again in a build that watches, once the config that failed it is mended", async () => {
    project = tempProject({
      "courier.config.ts": `${CONFIG}\nthrow new Error("not yet");\n`,
      "src/apis.ts": APIS,
      "src/page.ts": `export { routes } from "@noverax/courier/routes";\n`,
    });
    const root = project.root;
    const outcomes: string[] = [];
    watcher = (await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [courierRoutes()],
      build: {
        watch: {},
        lib: { entry: "src/page.ts", formats: ["es"], fileName: "page" },
        outDir: "dist",
      },
    })) as Rollup.RollupWatcher;
    watcher.on("event", (event) => {
      if (event.code === "ERROR" || event.code === "BUNDLE_END") outcomes.push(event.code);
    });
    await expect.poll(() => outcomes, { timeout: 30_000 }).toContain("ERROR");

    project.edit("courier.config.ts", () => CONFIG);

    await expect.poll(() => outcomes.at(-1), { timeout: 30_000 }).toBe("BUNDLE_END");
    const page = join(root, "dist/page.js");
    expect(existsSync(page) && readFileSync(page, "utf8")).toContain('"cart.add"');
  }, 90_000);

  it("tells every dev server it serves why the routes were not read", async () => {
    project = tempProject({
      "courier.config.ts": `${CONFIG}\nthrow new Error("broken for both");\n`,
      "src/apis.ts": APIS,
      "src/entry.ts": ENTRY,
    });
    const plugin = courierRoutes();
    const first = await serve(project.root, plugin);
    const second = await serve(project.root, plugin);
    const told: string[] = [];
    for (const [name, server] of [
      ["first", first],
      ["second", second],
    ] as const) {
      server.ws.send = ((payload: { err?: { message?: string } }) => {
        if (payload.err?.message?.includes("broken for both")) told.push(name);
      }) as typeof server.ws.send;
    }

    await sources(first);

    expect(told.sort()).toEqual(["first", "second"]);
  }, 60_000);
});
