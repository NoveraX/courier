/**
 * @vitest-environment node
 *
 * The paths a dev server's watcher is handed, each once: the routes module
 * is loaded again on every edit and follows the same paths, which chokidar
 * would otherwise watch over again, one more listener each time. A path the
 * watcher follows already, as it follows Vite's root, is not handed at all:
 * chokidar would read a folder handed to it as one just added, and take an
 * entry made by then for one that was there. A watcher that stops at a depth
 * is handed every path, as it lists the folders below it unread.
 */
import { resolve } from "node:path";
import type { ViteDevServer, WatchOptions } from "vite";
import { describe, expect, it } from "vitest";

import { watchOnce } from "../../src/vite/watch-once";

/*
 * A dev server whose watcher follows `watched`: each folder, with the names
 * of its entries. chokidar names a folder it follows by `path.resolve`, as
 * `D:\app` on Windows and `/app` elsewhere, and so does this watcher.
 */
function server(
  watched: Record<string, string[]> = {},
  options: WatchOptions = {},
): { server: ViteDevServer; added: string[][] } {
  const added: string[][] = [];
  const folders = Object.fromEntries(
    Object.entries(watched).map(([folder, entries]) => [resolve(folder), entries]),
  );
  const watcher = {
    options,
    add: (paths: string[]) => added.push(paths),
    getWatched: () => folders,
  };
  return { server: { watcher } as unknown as ViteDevServer, added };
}

describe("watchOnce", () => {
  it("hands the watcher only the paths it was not given yet", () => {
    const { server: dev, added } = server();

    watchOnce(dev, ["/app/courier.config.ts", "/app/src/apis.ts"]);
    watchOnce(dev, ["/app/src/apis.ts", "/app/.env.local"]);
    watchOnce(dev, ["/app/courier.config.ts"]);

    expect(added).toEqual([["/app/courier.config.ts", "/app/src/apis.ts"], ["/app/.env.local"]]);
  });

  it("hands the watcher none of the paths it follows already", () => {
    const { server: dev, added } = server({
      "/app": ["courier.config.ts", "package.json", "switches"],
      "/app/switches": [".keep"],
    });

    watchOnce(dev, [
      "/app/courier.config.ts",
      "/app/src/../package.json",
      "/app/switches",
      "/app/.env.local",
      "/lib/flags.json",
    ]);
    watchOnce(dev, ["/app/switches", "/app/.env.local"]);

    expect(added).toEqual([["/app/.env.local", "/lib/flags.json"]]);
  });

  it("hands a watcher that stops at a depth every path, as it lists the folders below it unread", () => {
    const { server: dev, added } = server(
      { "/app": ["switches"], "/app/switches": [] },
      { depth: 0 },
    );

    watchOnce(dev, ["/app/switches"]);

    expect(added).toEqual([["/app/switches"]]);
  });

  it("keeps each server's paths apart", () => {
    const first = server();
    const second = server();

    watchOnce(first.server, ["/app/courier.config.ts"]);
    watchOnce(second.server, ["/app/courier.config.ts"]);

    expect(second.added).toEqual([["/app/courier.config.ts"]]);
  });
});
