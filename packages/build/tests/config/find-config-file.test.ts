/**
 * @vitest-environment node
 *
 * The config a folder's project reads: the nearest up to the top of the
 * project, and one in a folder above only when no one else could have put
 * it there.
 */
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertOwnConfig } from "../../src/config/assert-own-config";
import { findConfigFile } from "../../src/config/load-config";
import { UntrustedConfigError } from "../../src/config/untrusted-config-error";

/* Owners and modes of that kind are POSIX's, and root may write anything. */
const posixUser = process.platform !== "win32" && process.getuid?.() !== 0;

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-find-config-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function config(folder: string): string {
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "courier.config.ts");
  writeFileSync(file, "export default { sources: {} };\n");
  return file;
}

describe("findConfigFile", () => {
  it("takes this user's config in a folder above the one it looks from", () => {
    const file = config(dir);
    mkdirSync(join(dir, "app"));

    expect(findConfigFile(join(dir, "app"))).toBe(file);
  });

  it("looks no further up than the folder that holds the project's repository", () => {
    config(dir);
    mkdirSync(join(dir, "repo", ".git"), { recursive: true });
    mkdirSync(join(dir, "repo", "app"));

    expect(findConfigFile(join(dir, "repo", "app"))).toBeNull();
  });

  it.skipIf(!posixUser)("refuses a config above the folder that any user may write", () => {
    const file = config(dir);
    chmodSync(file, 0o666);
    mkdirSync(join(dir, "app"));

    expect(() => findConfigFile(join(dir, "app"))).toThrow(UntrustedConfigError);
    expect(() => findConfigFile(join(dir, "app"))).toThrow(/any user may write it/);
  });

  it.skipIf(!posixUser)("takes a config in the folder itself, whoever may write it", () => {
    const file = config(dir);
    chmodSync(file, 0o666);

    expect(findConfigFile(dir)).toBe(file);
  });
});

describe("assertOwnConfig", () => {
  it.skipIf(!posixUser)(
    "refuses a file of another user, the owner of neither this process nor the folder",
    () => {
      expect(() => assertOwnConfig("/etc/hosts", dir)).toThrow(/belongs to uid 0/);
    },
  );

  it("takes a file of this user, looked for from a folder that may not be there", () => {
    const file = config(join(dir, "repo"));
    mkdirSync(join(dir, "repo", "app"));

    expect(() => assertOwnConfig(file, join(dir, "repo", "app"))).not.toThrow();
    expect(() => assertOwnConfig(file, join(dir, "repo", "gone"))).not.toThrow();
  });
});
