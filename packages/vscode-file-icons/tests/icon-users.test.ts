/**
 * The profiles on one computer that use a folder of Courier's icon copies:
 * each counted once, by a name that says nothing of whose it is; the last
 * one to let go told so, and Courier's folder taken away with it unless
 * the copies are still in it.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { iconUsers } from "../src/icon-users";

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
    const first = iconUsers(extensions, copies, "file:///profiles/first/globalStorage");
    const second = iconUsers(extensions, copies, "file:///profiles/second/globalStorage");

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
    const profile = iconUsers(extensions, copies, "file:///profiles/first/globalStorage");

    const counted = await profile.has();
    const unused = await profile.release();
    await profile.add();
    const names = readdirSync(join(courier, "users"), { recursive: true }).map(String);

    expect(counted).toBe(false);
    expect(unused).toBe(true);
    expect(names.join("/")).not.toMatch(/profiles|first|globalStorage|custom/);
  });

  it("leaves Courier's folder while the copies are in it", async () => {
    mkdirSync(courier, { recursive: true });
    writeFileSync(join(courier, "courier-config.svg"), "<svg/>");
    const profile = iconUsers(extensions, courier, "file:///profiles/first/globalStorage");
    await profile.add();

    const last = await profile.release();

    expect(last).toBe(true);
    expect(readdirSync(courier)).toEqual(["courier-config.svg"]);
  });
});
