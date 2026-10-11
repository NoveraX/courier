/**
 * The Studio a file belongs to: the nearest `.courier/studio.json` from the
 * file's folder up to its workspace folder, so each project of a monorepo
 * finds its own — none above the workspace, none in a file that names no
 * address.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { findStudio } from "../src/studio/find-studio";

const root = mkdtempSync(join(tmpdir(), "courier-vscode-"));
const address = (dir: string, value: unknown) => {
  mkdirSync(join(dir, ".courier"), { recursive: true });
  writeFileSync(join(dir, ".courier/studio.json"), JSON.stringify(value));
};

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("finding the Studio a file belongs to", () => {
  it("takes the nearest project's Studio, up to the workspace folder and no further", async () => {
    const workspace = join(root, "repo");
    mkdirSync(join(workspace, "apps/shop/src"), { recursive: true });
    mkdirSync(join(workspace, "apps/admin/src"), { recursive: true });
    address(join(workspace, "apps/shop"), { url: "http://localhost:6280", pid: 1 });
    address(root, { url: "http://localhost:9999", pid: 2 });

    expect(await findStudio(join(workspace, "apps/shop/src/cart.ts"), workspace)).toBe(
      "http://localhost:6280",
    );
    expect(await findStudio(join(workspace, "apps/admin/src/users.ts"), workspace)).toBeUndefined();
  });

  it("refuses an address that is not on this machine, which a repository could name to collect your files", async () => {
    const workspace = join(root, "cloned");
    mkdirSync(join(workspace, "src"), { recursive: true });
    address(workspace, { url: "https://collector.example/studio" });

    expect(await findStudio(join(workspace, "src/a.ts"), workspace)).toBeUndefined();
  });

  it("ignores a file that names no address Studio could answer at", async () => {
    const workspace = join(root, "odd");
    mkdirSync(join(workspace, "src"), { recursive: true });
    address(workspace, { url: "file:///etc/passwd" });

    expect(await findStudio(join(workspace, "src/a.ts"), workspace)).toBeUndefined();
  });
});
