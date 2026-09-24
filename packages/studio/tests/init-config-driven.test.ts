/**
 * Starting Studio on a project whose courier.mocks.ts does not load: the
 * config's sources are still bound, the mocks file is reported once the
 * banner is up, and the mock manager is told why it has no mocks.
 */
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Namespace } from "socket.io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BindingTable } from "../src/server/catalog/binding-table";
import { initConfigDriven } from "../src/server/init-config-driven";
import { createMockRegistry } from "../src/server/mock-registry";
import { clearStartupIssues, startupIssues } from "../src/server/startup-issues";
import { createWatcherStatus } from "../src/server/watcher-status";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-init-mocks-")));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(
    join(dir, "courier.config.ts"),
    'import { defineApi } from "@noverax/courier/define";\n' +
      'export default { sources: { api: defineApi({ baseURL: "https://api.example.com", endpoints: {} }) } };\n',
  );
  clearStartupIssues();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  clearStartupIssues();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

async function start() {
  const uiNamespace = { emit: vi.fn() } as unknown as Namespace;
  const bindingTable = new BindingTable();
  const setConfig = vi.spyOn(bindingTable, "setConfig");
  const mockRegistry = createMockRegistry();
  const mockManager = { setMocksFile: vi.fn() };
  const watcher = await initConfigDriven({
    projectRoot: dir,
    bindingTable,
    mockRegistry,
    uiNamespace,
    watcherStatus: createWatcherStatus(uiNamespace),
    mockManager,
  });
  watcher.stop();
  return { setConfig, mockRegistry, mockManager };
}

describe("initConfigDriven with a mocks file that does not load", () => {
  it("binds the config's sources and reports the mocks file once the banner is up", async () => {
    writeFileSync(join(dir, "courier.mocks.ts"), 'import { missing } from "./missing";\nexport default { missing };\n');

    const { setConfig, mockRegistry, mockManager } = await start();

    expect(Object.keys(setConfig.mock.calls[0]?.[0].sources ?? {})).toEqual(["api"]);
    expect(mockRegistry.getEntries()).toEqual([]);
    expect(mockManager.setMocksFile).toHaveBeenCalledWith({
      file: join(dir, "courier.mocks.ts"),
      error: expect.stringContaining("missing"),
    });
    expect(startupIssues()).toHaveLength(1);
    expect(startupIssues()[0]).toMatch(/^courier\.mocks\.ts did not load, so no mocks are declared: /);
  });

  it("reports nothing when the mocks file loads", async () => {
    writeFileSync(join(dir, "courier.mocks.ts"), "export default { a: { declared: true } };\n");

    const { mockRegistry, mockManager } = await start();

    expect(mockRegistry.getEntries().map((entry) => entry.key)).toEqual(["a"]);
    expect(mockManager.setMocksFile).toHaveBeenCalledWith({ file: join(dir, "courier.mocks.ts"), error: null });
    expect(startupIssues()).toEqual([]);
  });
});
