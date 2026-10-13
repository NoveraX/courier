/**
 * Where the project calls an endpoint is read from the project's own files
 * only: a link that stays in the project is followed, as the project's code
 * follows it, and a link that leads out of it is not — whether Git lists
 * the files or Studio walks the folders, and even when a folder becomes a
 * link to elsewhere between the listing and the read.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import type * as FsPromises from "node:fs/promises";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEndpoint } from "../../src/server/editor/endpoint-catalog";
import { createSiteIndex } from "../../src/server/editor/site-index";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, open: vi.fn(actual.open) };
});

const CATALOG: CatalogEndpoint[] = [
  { source: "shop", endpoint: "orders.place", parts: ["orders", "place"], kind: "mutation" },
];
const SECRET = 'await api.orders.place({ note: "OUTSIDE-SECRET" });\n';

let base: string;
let root: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "courier-site-index-")));
  root = join(base, "project");
  mkdirSync(join(root, "src", "nested"), { recursive: true });
  mkdirSync(join(base, "outside"));
  writeFileSync(join(root, "src", "app.ts"), "await api.orders.place({});\n");
  writeFileSync(join(root, "src", "nested", "cart.ts"), "await api.orders.place({ cart });\n");
  writeFileSync(join(base, "outside", "secret.ts"), SECRET);
  writeFileSync(join(base, "outside", "cart.ts"), SECRET);
});

afterEach(() => {
  vi.mocked(open).mockReset();
  rmSync(base, { recursive: true, force: true });
});

async function sitesIn(): Promise<{ file: string; code: string }[]> {
  const sites = await createSiteIndex(root, () => CATALOG).sitesOf("shop", "orders.place");
  return sites
    .map(({ file, code }) => ({ file, code }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

describe.skipIf(process.platform === "win32").each([
  ["Studio walks the folders", () => {}],
  ["Git lists the files", () => execFileSync("git", ["init", "--quiet"], { cwd: root })],
])("the call sites, when %s", (_how, prepare) => {
  beforeEach(() => {
    symlinkSync(join(root, "src", "app.ts"), join(root, "src", "alias.ts"));
    symlinkSync(join(base, "outside", "secret.ts"), join(root, "src", "leak.ts"));
    prepare();
  });

  it("follow a link that stays in the project, and not one that leads out", async () => {
    expect(await sitesIn()).toEqual([
      { file: "src/alias.ts", code: "await api.orders.place({});" },
      { file: "src/app.ts", code: "await api.orders.place({});" },
      { file: "src/nested/cart.ts", code: "await api.orders.place({ cart });" },
    ]);
  });

  it("read nothing from a folder that became a link outside after the files were listed", async () => {
    const actual = await vi.importActual<typeof FsPromises>("node:fs/promises");
    vi.mocked(open).mockImplementation(async (...args: Parameters<typeof actual.open>) => {
      if (String(args[0]).endsWith(join("nested", "cart.ts"))) {
        vi.mocked(open).mockImplementation(actual.open);
        renameSync(join(root, "src", "nested"), join(root, "src", "nested-real"));
        symlinkSync(join(base, "outside"), join(root, "src", "nested"));
      }
      return actual.open(...args);
    });

    const sites = await sitesIn();

    expect(sites.map((site) => site.file)).toEqual(["src/alias.ts", "src/app.ts"]);
    expect(JSON.stringify(sites)).not.toContain("OUTSIDE-SECRET");
  });
});
