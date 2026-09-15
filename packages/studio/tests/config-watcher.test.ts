import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BindingTable } from "../src/server/catalog/binding-table";
import type { LoadedCourierConfig } from "../src/server/config-loader";
import { startConfigWatcher } from "../src/server/config-watcher";

function makeLoaded(deps: string[]): LoadedCourierConfig {
  const config = { sources: {} } as unknown as CourierConfig;
  return { config, configFile: deps[0] ?? "", deps };
}

let stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

describe("startConfigWatcher", () => {
  it("returns the initial loaded config from getCurrent()", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-watcher-"));
    const file = join(dir, "courier.config.ts");
    writeFileSync(file, "");
    const initial = makeLoaded([file]);
    const watcher = startConfigWatcher(initial, {
      projectRoot: dir,
      bindingTable: new BindingTable(),
    });
    stops.push(() => watcher.stop());
    expect(watcher.getCurrent()).toBe(initial);
  });

  it("stop() is idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-watcher-"));
    const file = join(dir, "courier.config.ts");
    writeFileSync(file, "");
    const watcher = startConfigWatcher(makeLoaded([file]), {
      projectRoot: dir,
      bindingTable: new BindingTable(),
    });
    expect(() => {
      watcher.stop();
      watcher.stop();
    }).not.toThrow();
  });

  it("ignores deps that do not exist on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-watcher-"));
    const missing = join(dir, "ghost.ts");
    const watcher = startConfigWatcher(makeLoaded([missing]), {
      projectRoot: dir,
      bindingTable: new BindingTable(),
    });
    stops.push(() => watcher.stop());
    expect(watcher.getCurrent().deps).toEqual([missing]);
  });

  it("does not invoke onReload synchronously", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-watcher-"));
    const file = join(dir, "courier.config.ts");
    writeFileSync(file, "");
    const onReload = vi.fn();
    const watcher = startConfigWatcher(makeLoaded([file]), {
      projectRoot: dir,
      bindingTable: new BindingTable(),
      onReload,
    });
    stops.push(() => watcher.stop());
    expect(onReload).not.toHaveBeenCalled();
  });
});
