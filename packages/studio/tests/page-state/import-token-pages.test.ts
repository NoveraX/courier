/**
 * The API import left unfinished is the pages' with the project's token
 * alone. A page opened without it is sent none — as it connects, or as a
 * page with the token types — so an address on its way to being typed
 * whole, a password before its `@`, never reaches it; what every page
 * keeps, its settings, it is sent as before. Values are made up.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingTable } from "../../src/server/catalog/binding-table";
import { createPageState } from "../../src/server/storage/page-state";
import { openStudioDb } from "../../src/server/storage/studio-db";
import type { StudioToken } from "../../src/server/studio-token";
import { setupUiNamespace } from "../../src/server/ui-namespace";
import { createUpdateChecks } from "../../src/server/update-checks";

const TOKEN: StudioToken = {
  value: "page-token-made-up",
  matches: (candidate) => candidate === "page-token-made-up",
};
const STARTING = { revision: 0, starting: true, running: null, loadedAt: null, failure: null };
const KEPT = { source: "url", content: "https://api.test/openapi.json?page=2" };
/* An address on its way to being typed: no URL yet, a password before its `@`. */
const TYPING = { source: "url", content: "https://ana:pw-made-up-7" };

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/* Studio's pages' namespace over a project whose pages kept their settings and an import left unfinished. */
async function studio(): Promise<string> {
  const folder = mkdtempSync(join(tmpdir(), "courier-import-pages-"));
  cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
  const stored = openStudioDb(folder);
  cleanups.push(() => stored.close());
  const pageState = createPageState(stored.db);
  pageState.write("settings", { theme: "light" });
  pageState.write("apis.import", KEPT);
  const http = createServer();
  const io = new Server(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => void io.close(() => resolve())));
  setupUiNamespace({
    uiNamespace: io.of("/ui"),
    bindingTable: new BindingTable(),
    project: {
      snapshot: () => STARTING,
      fresh: async () => ({ ...STARTING, settling: false }),
      importsChanged: () => undefined,
      updateChecks: createUpdateChecks(),
    },
    projectRoot: folder,
    token: TOKEN,
    pageState,
  });
  const { port } = http.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

/* A page, and what it is sent of the page state: as it connects, then each change. */
async function page(url: string, token?: string) {
  const socket: Socket = connect(`${url}/ui`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    ...(token !== undefined && { auth: { token } }),
  });
  cleanups.push(() => void socket.disconnect());
  const seen = { state: undefined as unknown, changed: [] as unknown[] };
  socket.on("page:state", (payload: { state: unknown }) => {
    seen.state = payload.state;
  });
  socket.on("page:state:changed", (change: unknown) => void seen.changed.push(change));
  await vi.waitFor(() => expect(seen.state).toBeDefined());
  return { socket, seen };
}

describe("the import left unfinished", () => {
  it("is sent to a page with the token as it connects, and to no other", async () => {
    const url = await studio();

    const withToken = await page(url, TOKEN.value);
    const without = await page(url);

    expect(withToken.seen.state).toEqual({ settings: { theme: "light" }, "apis.import": KEPT });
    expect(without.seen.state).toEqual({ settings: { theme: "light" } });
  });

  it("follows the pages with the token as one types, and no other page", async () => {
    const url = await studio();
    const typing = await page(url, TOKEN.value);
    const other = await page(url, TOKEN.value);
    const without = await page(url);

    typing.socket.emit("page:state:set", { key: "apis.import", value: TYPING });
    typing.socket.emit("page:state:set", { key: "settings", value: { theme: "dark" } });
    /* Each page is sent the changes in the order they were made: once the second is here, so is any first. */
    await vi.waitFor(() => expect(without.seen.changed).toHaveLength(1));
    await vi.waitFor(() => expect(other.seen.changed).toHaveLength(2));

    expect(other.seen.changed).toEqual([
      { key: "apis.import", value: TYPING },
      { key: "settings", value: { theme: "dark" } },
    ]);
    expect(without.seen.changed).toEqual([{ key: "settings", value: { theme: "dark" } }]);
    expect(JSON.stringify(without.seen)).not.toContain("pw-made-up-7");
  });
});
