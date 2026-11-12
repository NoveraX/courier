/**
 * @vitest-environment node
 *
 * The chain of imports a load error names, read off the loader's module
 * cache: each module by its path as the system names it, however the
 * loader wrote it, and the failed module found whichever way the error
 * names it.
 */
import type { ModuleCache, NodeModule } from "jiti";
import { afterEach, describe, expect, it } from "vitest";

import { importChain } from "../../src/config/load-error/import-chain";

const PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

afterEach(() => {
  if (PLATFORM !== undefined) Object.defineProperty(process, "platform", PLATFORM);
});

function onWindows(): void {
  Object.defineProperty(process, "platform", { ...PLATFORM, value: "win32" });
}

/* A module as the loader keeps it: its file, what it imported, and whether it ran to its end. */
function loaded(filename: string, children: NodeModule[] = []): NodeModule {
  return { filename, children, loaded: false } as unknown as NodeModule;
}

/* The config imports the API, which imported the database module, then the log, the newest. */
function project(entry: string, folder: string): ModuleCache {
  const db = loaded(`${folder}/src/server/db.ts`);
  const log = loaded(`${folder}/src/log.ts`);
  const api = loaded(`${folder}/src/api.ts`, [db, log]);
  return { [entry]: loaded(entry, [api]) };
}

describe("importChain", () => {
  it("names each module as Windows does, where the loader writes a path with /", () => {
    onWindows();
    const entry = "D:/a/_temp/shop/courier.config.ts";
    const cache = project(entry, "D:/a/_temp/shop");

    expect(importChain(cache, entry)).toEqual([
      "D:\\a\\_temp\\shop\\courier.config.ts",
      "D:\\a\\_temp\\shop\\src\\api.ts",
      "D:\\a\\_temp\\shop\\src\\log.ts",
    ]);
    expect(importChain({}, entry)).toEqual(["D:\\a\\_temp\\shop\\courier.config.ts"]);
  });

  it("finds the failed module on Windows whichever separator and case the error names it with", () => {
    onWindows();
    const entry = "D:\\a\\_temp\\shop\\courier.config.ts";
    const cache = project(entry, "D:/a/_temp/shop");
    const chain = [
      "D:\\a\\_temp\\shop\\courier.config.ts",
      "D:\\a\\_temp\\shop\\src\\api.ts",
      "D:\\a\\_temp\\shop\\src\\server\\db.ts",
    ];

    expect(importChain(cache, entry, "D:\\a\\_temp\\shop\\src\\server\\db.ts")).toEqual(chain);
    expect(importChain(cache, entry, "D:/a/_temp/shop/src/server/db.ts")).toEqual(chain);
    expect(importChain(cache, entry, "d:\\a\\_temp\\shop\\src\\server\\db.ts")).toEqual(chain);
  });

  it("names each module by its path on POSIX, and follows the newest unfinished import", () => {
    const entry = "/srv/shop/courier.config.ts";
    const cache = project(entry, "/srv/shop");

    expect(importChain(cache, entry)).toEqual([
      "/srv/shop/courier.config.ts",
      "/srv/shop/src/api.ts",
      "/srv/shop/src/log.ts",
    ]);
    expect(importChain(cache, entry, "/srv/shop/src/server/db.ts")).toEqual([
      "/srv/shop/courier.config.ts",
      "/srv/shop/src/api.ts",
      "/srv/shop/src/server/db.ts",
    ]);
  });
});
