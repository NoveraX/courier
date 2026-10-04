/**
 * Where Studio keeps a managed mock's store: a file in `.courier/mocks/`
 * named by the mock's key, written with safe characters and told apart by a
 * hash; none when `.courier` is a link, which Studio writes nothing through.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockStoreFile } from "../src/server/mock-store-file";

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-mock-store-file-"));
  roots.push(dir);
  return dir;
}

describe("mockStoreFile", () => {
  it("is a JSON file in .courier/mocks, named by the key, the folder created", () => {
    const project = root();

    const file = mockStoreFile(project, "usersMock");

    expect(dirname(file ?? "")).toBe(join(project, ".courier", "mocks"));
    expect(basename(file ?? "")).toMatch(/^usersMock-[0-9a-f]{8}\.sqlite$/);
  });

  it("writes a key with safe characters only, and tells two keys that read alike apart", () => {
    const project = root();

    const a = basename(mockStoreFile(project, "users/mock*") ?? "");
    const b = basename(mockStoreFile(project, "users:mock?") ?? "");

    expect(a).toMatch(/^users_mock_-[0-9a-f]{8}\.sqlite$/);
    expect(b).toMatch(/^users_mock_-[0-9a-f]{8}\.sqlite$/);
    expect(a).not.toBe(b);
  });

  it("is the same file for the same key each time", () => {
    const project = root();

    expect(mockStoreFile(project, "usersMock")).toBe(mockStoreFile(project, "usersMock"));
  });

  /* A link needs a privilege Windows grants few accounts. */
  it.skipIf(process.platform === "win32")("is none, and says so, when .courier is a link", () => {
    const project = root();
    const elsewhere = root();
    mkdirSync(join(elsewhere, "target"));
    symlinkSync(join(elsewhere, "target"), join(project, ".courier"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(mockStoreFile(project, "usersMock")).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0])).toContain("usersMock starts from its seeds");
  });
});
