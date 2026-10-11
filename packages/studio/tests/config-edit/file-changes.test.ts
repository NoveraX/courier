/**
 * Writing the files of one change to the project's config — the config and
 * the module it takes its `sources` from — as one: each only while it holds
 * the bytes the change was planned against, the ones written before put
 * back when a later one cannot be, and a save made since never overwritten.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type FileChange,
  listed,
  restoreFileChanges,
  writeFileChanges,
} from "../../src/server/config-edit/file-changes";
import type { ExclusiveContext } from "../../src/server/exclusive-context";
import { sha256Hex } from "../../src/server/sha256-hex";

let root: string;
let tx: ExclusiveContext;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "file-changes-")));
  tx = {
    current: vi.fn(() => null),
    load: vi.fn(),
    apply: vi.fn(),
    acknowledge: vi.fn(),
    reloadAfter: vi.fn(),
  };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function change(file: string, text: string, planned: string): FileChange {
  const path = join(root, file);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  return { path, file, text, baseHash: sha256Hex(text), mode: 0o644, planned, edits: [] };
}

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

describe("writeFileChanges", () => {
  it("writes every file in order, and takes them all as seen", () => {
    const module = change(
      "lib/sources.ts",
      "export const sources = {};\n",
      "export const sources = { pets };\n",
    );
    const config = change(
      "courier.config.ts",
      "export default { sources };\n",
      "export default { sources, imports: {} };\n",
    );

    const outcome = writeFileChanges([module, config], tx, root);

    expect(outcome).toEqual({ status: "written", written: [module, config] });
    expect(read("lib/sources.ts")).toBe(module.planned);
    expect(read("courier.config.ts")).toBe(config.planned);
    expect(tx.acknowledge).toHaveBeenCalledWith([module.path, config.path]);
  });

  it("stops at a file saved since it was read, and puts back the ones written before it", () => {
    const module = change(
      "lib/sources.ts",
      "export const sources = {};\n",
      "export const sources = { pets };\n",
    );
    const config = change(
      "courier.config.ts",
      "export default { sources };\n",
      "export default { sources, imports: {} };\n",
    );
    writeFileSync(config.path, "export default { sources }; // saved\n");

    const outcome = writeFileChanges([module, config], tx, root);

    expect(outcome).toEqual({ status: "stale" });
    expect(read("lib/sources.ts")).toBe(module.text);
    expect(read("courier.config.ts")).toBe("export default { sources }; // saved\n");
  });

  it("says which file it could not write, and that the one before it is back", () => {
    const module = change(
      "lib/sources.ts",
      "export const sources = {};\n",
      "export const sources = { pets };\n",
    );
    const config = change(
      "conf/courier.config.ts",
      "export default {};\n",
      "export default { imports: {} };\n",
    );
    rmSync(join(root, "conf"), { recursive: true, force: true });

    const outcome = writeFileChanges([module, config], tx, root);

    expect(outcome.status).toBe("failed");
    expect(outcome.status === "failed" && outcome.reason).toMatch(
      /^Studio could not write conf\/courier\.config\.ts \(.+\), so Studio put lib\/sources\.ts back as it was\.$/,
    );
    expect(read("lib/sources.ts")).toBe(module.text);
  });
});

describe("restoreFileChanges", () => {
  it("puts every file back, last written first, and finishes the reason", () => {
    const module = change("lib/sources.ts", "a\n", "b\n");
    const config = change("courier.config.ts", "c\n", "d\n");
    writeFileChanges([module, config], tx, root);

    const reason = restoreFileChanges(tx, [module, config], "courier.config.ts did not load", root);

    expect(reason).toBe(
      "courier.config.ts did not load, so Studio put lib/sources.ts and courier.config.ts back as they were.",
    );
    expect(read("lib/sources.ts")).toBe("a\n");
    expect(read("courier.config.ts")).toBe("c\n");
  });

  it("keeps a save made since the write, reloads that file once the edit ends, and says to check it", () => {
    const module = change("lib/sources.ts", "a\n", "b\n");
    const config = change("courier.config.ts", "c\n", "d\n");
    writeFileChanges([module, config], tx, root);
    writeFileSync(module.path, "b\n// saved\n");

    const reason = restoreFileChanges(tx, [module, config], "courier.config.ts did not load", root);

    expect(reason).toMatch(
      /^courier\.config\.ts did not load, and Studio put courier\.config\.ts back, and could not put back lib\/sources\.ts \(.+\): check lib\/sources\.ts\.$/,
    );
    expect(read("lib/sources.ts")).toBe("b\n// saved\n");
    expect(read("courier.config.ts")).toBe("c\n");
    expect(tx.reloadAfter).toHaveBeenCalledWith([module.path]);
  });
});

describe("listed", () => {
  it("names files as a sentence does", () => {
    expect(listed([])).toBe("");
    expect(listed(["a.ts"])).toBe("a.ts");
    expect(listed(["a.ts", "b.ts"])).toBe("a.ts and b.ts");
    expect(listed(["a.ts", "b.ts", "c.ts"])).toBe("a.ts, b.ts and c.ts");
  });
});
