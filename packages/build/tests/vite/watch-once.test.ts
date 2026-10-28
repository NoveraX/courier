/**
 * @vitest-environment node
 *
 * The paths a dev server's watcher is handed, each once: the routes module
 * is loaded again on every edit and follows the same paths, which chokidar
 * would otherwise watch over again, one more listener each time.
 */
import type { ViteDevServer } from "vite";
import { describe, expect, it } from "vitest";

import { watchOnce } from "../../src/vite/watch-once";

function server(): { server: ViteDevServer; added: string[][] } {
  const added: string[][] = [];
  const fake = { watcher: { add: (paths: string[]) => added.push(paths) } };
  return { server: fake as unknown as ViteDevServer, added };
}

describe("watchOnce", () => {
  it("hands the watcher only the paths it was not given yet", () => {
    const { server: dev, added } = server();

    watchOnce(dev, ["/app/courier.config.ts", "/app/src/apis.ts"]);
    watchOnce(dev, ["/app/src/apis.ts", "/app/.env.local"]);
    watchOnce(dev, ["/app/courier.config.ts"]);

    expect(added).toEqual([["/app/courier.config.ts", "/app/src/apis.ts"], ["/app/.env.local"]]);
  });

  it("keeps each server's paths apart", () => {
    const first = server();
    const second = server();

    watchOnce(first.server, ["/app/courier.config.ts"]);
    watchOnce(second.server, ["/app/courier.config.ts"]);

    expect(second.added).toEqual([["/app/courier.config.ts"]]);
  });
});
