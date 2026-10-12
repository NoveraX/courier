/**
 * What the pages keep in the project — settings, Get started's progress,
 * the Playground's drafts, the pins — and the conditions set on each mock,
 * kept in Studio's database so another browser, a reload or a restart has
 * them again.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import { keepConditions } from "../../src/server/mock-manager/mock-conditions";
import type { ServerState } from "../../src/server/mock-manager/types";
import { createRequestLog } from "../../src/server/request-log";
import { createMockConditionsStore } from "../../src/server/storage/mock-conditions-store";
import { createPageState } from "../../src/server/storage/page-state";
import { createRequestPins } from "../../src/server/storage/request-pins";
import { openStudioDb } from "../../src/server/storage/studio-db";
import { bindPageState } from "../../src/server/ui-page-state";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function database(root?: string) {
  const folder = root ?? mkdtempSync(join(tmpdir(), "courier-page-state-"));
  /* Removed once, after every database opened in it has closed: Windows
     keeps a folder that holds an open file. */
  if (root === undefined) cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
  const studio = openStudioDb(folder);
  cleanups.push(() => studio.close());
  return { db: studio.db, root: folder };
}

describe("the page state", () => {
  it("keeps each value under a name a page keeps, and nothing else", () => {
    const pages = createPageState(database().db);

    expect(pages.write("settings", { theme: "light" })).toBe(true);
    expect(pages.write("setup", { frameworkId: "next", copied: [], completed: true })).toBe(true);
    expect(pages.write("token", { secret: "x" })).toBe(false);
    expect(pages.write("settings", "not an object")).toBe(false);
    expect(pages.write("settings", { blob: "x".repeat(300 * 1024) })).toBe(false);

    expect(pages.read()).toEqual({
      settings: { theme: "light" },
      setup: { frameworkId: "next", copied: [], completed: true },
    });
  });

  it("is sent as a page connects, with whether it may change it, and followed by the others", () => {
    const pages = createPageState(database().db);
    pages.write("settings", { theme: "light" });
    const handlers = new Map<string, (raw: unknown) => void>();
    const emit = vi.fn();
    const broadcast = vi.fn();
    const socket = {
      emit,
      on: (event: string, handler: (raw: unknown) => void) => handlers.set(event, handler),
      broadcast: { emit: broadcast },
    };

    bindPageState(socket as unknown as Socket, pages, true);
    handlers.get("page:state:set")?.({ key: "playground.drafts", value: { variables: {} } });
    handlers.get("page:state:set")?.({ key: "token", value: {} });

    expect(emit).toHaveBeenCalledWith("page:state", {
      writable: true,
      state: { settings: { theme: "light" } },
    });
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith("page:state:changed", {
      key: "playground.drafts",
      value: { variables: {} },
    });
  });
});

describe("the pins", () => {
  it("are kept across a restart, and only for requests still kept", () => {
    const { db, root } = database();
    const pins = createRequestPins(db);
    pins.set("r1", true);
    pins.set("r2", true);
    pins.set("r2", false);
    pins.set("r3", true);
    pins.retain(new Set(["r1", "r2"]));

    expect(createRequestPins(database(root).db).ids()).toEqual(["r1"]);
  });

  it("keep a pinned request as the log lets its oldest go", () => {
    const { db } = database();
    const pinned = new Set(["r0"]);
    const log = createRequestLog(db, undefined, (id) => pinned.has(id));
    for (let i = 0; i <= 2000; i++) {
      log.record({ type: "request:start", id: `r${i}`, source: "api", method: "list" }, "s1");
    }

    const ids = new Set(log.events().map((event) => event.id));

    expect(ids.has("r0")).toBe(true);
    expect(ids.has("r1")).toBe(false);
    log.close();
  });
});

describe("a mock's conditions", () => {
  function mock(fields: Partial<ServerState> = {}): ServerState {
    return {
      serverId: "shop",
      mockKey: "shop",
      declaredNetwork: "{}",
      activeScenario: null,
      scenarios: [{ name: "outage" }],
      networkConfig: undefined,
      ...fields,
    } as unknown as ServerState;
  }

  it("are kept as the mock reports them, and set again when it starts again", () => {
    const store = createMockConditionsStore(database().db);
    const servers = new Map([
      [
        "shop",
        mock({ networkConfig: { errorRate: 1, chaosPreset: "down" }, activeScenario: "outage" }),
      ],
    ]);
    const send = vi.fn(async () => ({ ok: true }));
    const keeper = keepConditions(servers, store, send);
    keeper.keep("shop");

    servers.set("shop", mock());
    keeper.restore("shop");

    expect(send).toHaveBeenCalledWith("shop", {
      action: "mock:network:restore",
      serverId: "shop",
      config: { errorRate: 1, chaosPreset: "down" },
      latencyPreset: undefined,
      chaosPreset: "down",
    });
    expect(send).toHaveBeenCalledWith("shop", {
      action: "mock:scenario:apply",
      serverId: "shop",
      scenario: "outage",
    });
  });

  it("are forgotten once the mocks file declares other network conditions", () => {
    const store = createMockConditionsStore(database().db);
    const servers = new Map([["shop", mock({ networkConfig: { errorRate: 1 } })]]);
    const send = vi.fn(async () => ({ ok: true }));
    const keeper = keepConditions(servers, store, send);
    keeper.keep("shop");

    servers.set("shop", mock({ declaredNetwork: '{"latency":200}' }));
    keeper.restore("shop");

    expect(send).not.toHaveBeenCalled();
    expect(store.read("shop")).toBeUndefined();
  });

  it("send nothing when the mock starts as it was kept", () => {
    const store = createMockConditionsStore(database().db);
    const servers = new Map([["shop", mock()]]);
    const send = vi.fn(async () => ({ ok: true }));
    const keeper = keepConditions(servers, store, send);
    keeper.keep("shop");

    keeper.restore("shop");

    expect(send).not.toHaveBeenCalled();
  });
});
