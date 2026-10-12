/**
 * The profiles on one computer that use a folder of Courier's icon copies:
 * each told apart by an id it keeps in its own state, counted once, by a
 * name that says nothing of whose it is; one not seen for ninety days no
 * longer counted; the last one to let go told so, and Courier's folder
 * taken away with it unless the copies are still in it.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";

import { iconUsers, profileOf } from "../src/icon-users";

let extensions: string;
let courier: string;
let copies: string;

beforeEach(() => {
  extensions = join(mkdtempSync(join(tmpdir(), "courier-users-")), "extensions");
  courier = join(extensions, ".noverax-courier-icons");
  copies = join(tmpdir(), "custom", "vsicons-custom-icons");
});

describe("the profiles that use a folder of Courier's copies", () => {
  it("counts each profile once, and says when the last one lets go", async () => {
    const first = iconUsers(extensions, copies, "7f9c2ba4-e88f-4c1d-9a3e-first");
    const second = iconUsers(extensions, copies, "0b6e1d55-2c47-4f0e-8d1a-second");

    await first.add();
    await first.add();
    await second.add();
    const both = [await first.has(), await second.has()];
    const afterSecond = await second.release();
    const afterFirst = await first.release();

    expect(both).toEqual([true, true]);
    expect(afterSecond).toBe(false);
    expect(afterFirst).toBe(true);
    expect(existsSync(courier)).toBe(false);
  });

  it("says no profile uses copies nobody counted in, and names no profile's folder", async () => {
    const profile = iconUsers(extensions, copies, "7f9c2ba4-e88f-4c1d-9a3e-first");

    const counted = await profile.has();
    const unused = await profile.release();
    await profile.add();
    const names = readdirSync(join(courier, "users"), { recursive: true }).map(String);

    expect(counted).toBe(false);
    expect(unused).toBe(true);
    expect(names.join("/")).not.toMatch(/first|7f9c2ba4|custom/);
  });

  it("leaves Courier's folder while the copies are in it", async () => {
    mkdirSync(courier, { recursive: true });
    writeFileSync(join(courier, "courier-config.svg"), "<svg/>");
    const profile = iconUsers(extensions, courier, "7f9c2ba4-e88f-4c1d-9a3e-first");
    await profile.add();

    const last = await profile.release();

    expect(last).toBe(true);
    expect(readdirSync(courier)).toEqual(["courier-config.svg"]);
  });
});

describe("a profile's own id", () => {
  const stateOf = (kept: Map<string, unknown>) =>
    ({
      get: (key: string) => kept.get(key),
      update: async (key: string, value: unknown) => void kept.set(key, value),
    }) as unknown as vscode.Memento;

  it("is made once and kept in the profile's state, another profile's apart", async () => {
    const first = new Map<string, unknown>();
    const second = new Map<string, unknown>();

    const made = profileOf(stateOf(first));
    await Promise.resolve();
    const again = profileOf(stateOf(first));
    const other = profileOf(stateOf(second));

    expect(again).toBe(made);
    expect(other).not.toBe(made);
    expect([...first.values()]).toEqual([made]);
  });
});

describe("a profile gone for good", () => {
  it("no longer keeps the copies after ninety days without starting", async () => {
    const gone = iconUsers(extensions, copies, "a-profile-deleted-long-ago");
    const still = iconUsers(extensions, copies, "a-profile-in-use");
    await gone.add();
    const folder = join(courier, "users", readdirSync(join(courier, "users"))[0] ?? "");
    const longAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    for (const mark of readdirSync(folder)) utimesSync(join(folder, mark), longAgo, longAgo);
    await still.add();

    const last = await still.release();

    expect(last).toBe(true);
    expect(existsSync(courier)).toBe(false);
  });
});
