import { utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import type { RoutesEngine } from "../../src/engine/routes-engine";
import type { RoutesSnapshot } from "../../src/engine/routes-snapshot";
import { ROUTES_MODULE_ID } from "../../src/util/routes-module-id";
import { loadRoutesModule } from "../../src/vite/load-routes-module";
import type { RoutesPluginState } from "../../src/vite/routes-plugin-state";
import { APIS, CONFIG, type TempProject, tempProject } from "./temp-project";

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* A dev server, by what it is asked when the routes are to be read again. */
function devServer(): { server: ViteDevServer; sent: unknown[] } {
  const sent: unknown[] = [];
  const graph = {
    getModuleById: (id: string) => (id === ROUTES_MODULE_ID ? { id } : undefined),
    invalidateModule: () => undefined,
  };
  const server = {
    environments: { client: { moduleGraph: graph } },
    watcher: { options: {}, getWatched: () => ({}), add: () => undefined },
    ws: { send: (payload: unknown) => sent.push(payload) },
  };
  return { server: server as unknown as ViteDevServer, sent };
}

/* A reading of the shop's routes, the config and its definitions read; `meanwhile` runs as it does. */
function loading(followed: readonly string[], meanwhile?: (apis: string) => void) {
  project = tempProject({ "courier.config.ts": CONFIG, "src/apis.ts": APIS });
  const config = join(project.root, "courier.config.ts");
  const apis = join(project.root, "src/apis.ts");
  for (const file of [config, apis]) dated(file, -60_000);
  const snapshot: RoutesSnapshot = {
    configFile: config,
    files: [config, apis],
    env: [],
    routes: {},
  };
  const engine: RoutesEngine = {
    read: async () => {
      meanwhile?.(apis);
      return snapshot;
    },
    last: snapshot,
    fingerprint: () => undefined,
  };
  const { server, sent } = devServer();
  const state: RoutesPluginState = {
    engine,
    servers: new Set([server]),
    followed: new Set(followed.map((path) => join(project?.root ?? "", path))),
    listed: new Set(),
    underVitest: false,
  };
  const context = {
    addWatchFile: () => undefined,
    error: (error: Error): never => {
      throw error;
    },
  };
  return { load: () => loadRoutesModule(context, state), sent };
}

/* A change saved now, as the reading runs, dated a second on. */
function save(file: string): void {
  writeFileSync(file, `${APIS}\n`);
  dated(file, 1_000);
}

/* Date a file `ms` from now, clear of the moment the reading began: a time set on a file
   comes back rounded, and one set in the reading's first millisecond could read as before it. */
function dated(file: string, ms: number): void {
  const at = new Date(Date.now() + ms);
  utimesSync(file, at, at);
}

describe("the routes module, loaded in a dev server", () => {
  it("is read again when a file it follows only now was changed as it was read", async () => {
    const { load, sent } = loading([], save);

    await load();

    expect(sent).toEqual([{ type: "full-reload" }]);
  });

  it("is not read again for a change to a file it followed already, which Vite tells of", async () => {
    const { load, sent } = loading(["courier.config.ts", "src/apis.ts"], save);

    await load();

    expect(sent).toEqual([]);
  });

  it("is not read again for files saved before the reading began", async () => {
    const { load, sent } = loading([]);

    await load();

    expect(sent).toEqual([]);
  });
});
