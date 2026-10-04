import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNotificationTrust } from "../src/server/notification-trust";

const EXT4 = 0xef53;
const NFS = 0x6969;
const CIFS = 0xff534d42;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-trust-"));
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("createNotificationTrust", () => {
  it("takes a local filesystem at its word", () => {
    const trust = createNotificationTrust({ platform: "linux", filesystemType: () => EXT4 });

    expect(trust.announces(root)).toBe(true);
  });

  it.each([
    ["NFS", NFS],
    ["CIFS, read as a signed number", CIFS | 0],
  ])("takes a Linux %s share as announcing nothing", (_, type) => {
    const trust = createNotificationTrust({ platform: "linux", filesystemType: () => type });

    expect(trust.announces(root)).toBe(false);
  });

  it("reads no filesystem type off Linux", () => {
    const filesystemType = vi.fn(() => NFS);
    const trust = createNotificationTrust({ platform: "darwin", filesystemType });

    expect(trust.announces(root)).toBe(true);
    expect(filesystemType).not.toHaveBeenCalled();
  });

  it("reads each filesystem's type once, and judges a missing directory by the one it would be on", () => {
    const filesystemType = vi.fn(() => EXT4);
    const trust = createNotificationTrust({ platform: "linux", filesystemType });
    mkdirSync(join(root, "src"));

    trust.announces(root);
    trust.announces(join(root, "src"));
    trust.announces(join(root, "not", "yet"));

    expect(filesystemType).toHaveBeenCalledTimes(1);
  });

  it("takes a filesystem whose type cannot be read at its word", () => {
    const trust = createNotificationTrust({
      platform: "linux",
      filesystemType: () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    });

    expect(trust.announces(root)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "judges a directory that cannot be looked up by the filesystem of the nearest one that can",
    () => {
      const loop = join(root, "loop");
      symlinkSync(loop, loop);
      vi.spyOn(console, "debug").mockImplementation(() => undefined);
      const trust = createNotificationTrust({ platform: "linux", filesystemType: () => NFS });

      expect(trust.announces(join(loop, "src"))).toBe(false);
    },
  );

  it("takes no directory at its word when polling is asked for everywhere", () => {
    const trust = createNotificationTrust({ pollEverywhere: true, platform: "darwin" });

    expect(trust.announces(root)).toBe(false);
  });

  it("takes a directory no native watch could be armed on as announcing nothing, and that one only", () => {
    const trust = createNotificationTrust({ platform: "darwin" });
    mkdirSync(join(root, "src"));

    trust.refused(join(root, "src"));

    expect(trust.announces(join(root, "src"))).toBe(false);
    expect(trust.announces(root)).toBe(true);
  });

  it("takes the whole filesystem as announcing nothing from its second missed save", () => {
    const trust = createNotificationTrust({ platform: "darwin" });
    mkdirSync(join(root, "a"));
    mkdirSync(join(root, "b"));

    expect(trust.missed(join(root, "a"))).toBe(false);
    expect(trust.announces(join(root, "b"))).toBe(true);

    expect(trust.missed(join(root, "a"))).toBe(true);
    expect(trust.announces(join(root, "b"))).toBe(false);
    expect(trust.missed(join(root, "b"))).toBe(false);
  });
});
