/**
 * Courier's icons in vscode-icons: the custom icons folder found as
 * vscode-icons finds it — the setting's, a relative one from the first
 * workspace folder, or the user folder of the editor's build — and
 * Courier's entries put in after the user's own and taken out again.
 */
import { describe, expect, it } from "vitest";

import {
  hasCourierEntries,
  VSICONS_PLAN,
  vsiconsFolder,
  withCourierEntries,
  withoutCourierEntries,
} from "../src/icons/vscode-icons";

const home = (change: Partial<Parameters<typeof vsiconsFolder>[0]> = {}) => ({
  setting: "",
  workspaces: ["/work/shop"],
  appName: "Visual Studio Code",
  platform: "darwin" as const,
  env: {},
  home: "/Users/me",
  ...change,
});

describe("the folder vscode-icons reads custom icons from", () => {
  it("is in the user folder of the editor's build", () => {
    expect(vsiconsFolder(home())).toBe(
      "/Users/me/Library/Application Support/Code/User/vsicons-custom-icons",
    );
    expect(
      vsiconsFolder(home({ appName: "Visual Studio Code - Insiders", platform: "linux" })),
    ).toBe("/Users/me/.config/Code - Insiders/User/vsicons-custom-icons");
    expect(vsiconsFolder(home({ appName: "Code - OSS" }))).toContain("/Code - OSS/User/");
    expect(vsiconsFolder(home({ appName: "Code - OSS Dev" }))).toContain("/code-oss-dev/User/");
  });

  it("is under a portable install's data, and under the folder the setting names", () => {
    expect(vsiconsFolder(home({ env: { VSCODE_PORTABLE: "/apps/code/data" } }))).toBe(
      "/apps/code/data/user-data/User/vsicons-custom-icons",
    );
    expect(vsiconsFolder(home({ setting: "/team/icons" }))).toBe(
      "/team/icons/vsicons-custom-icons",
    );
    expect(vsiconsFolder(home({ setting: ".vscode/icons" }))).toBe(
      "/work/shop/.vscode/icons/vsicons-custom-icons",
    );
  });

  it("is written as Windows writes paths when the editor runs there, whichever system works it out", () => {
    const windows = (change: Partial<Parameters<typeof vsiconsFolder>[0]> = {}) =>
      home({
        platform: "win32",
        home: "D:\\Profiles\\me",
        workspaces: ["D:\\work\\shop"],
        env: { APPDATA: "D:\\Profiles\\me\\AppData\\Roaming" },
        ...change,
      });

    expect(vsiconsFolder(windows())).toBe(
      "D:\\Profiles\\me\\AppData\\Roaming\\Code\\User\\vsicons-custom-icons",
    );
    expect(vsiconsFolder(windows({ env: {} }))).toBe(
      "D:\\Profiles\\me\\AppData\\Roaming\\Code\\User\\vsicons-custom-icons",
    );
    expect(vsiconsFolder(windows({ setting: "E:\\team\\icons" }))).toBe(
      "E:\\team\\icons\\vsicons-custom-icons",
    );
    expect(vsiconsFolder(windows({ setting: ".vscode\\icons" }))).toBe(
      "D:\\work\\shop\\.vscode\\icons\\vsicons-custom-icons",
    );
  });
});

describe("Courier's entries among the user's", () => {
  const mine = { icon: "my-icon", extensions: ["mai"], format: "svg" };

  it("go after the user's own, an older Courier's replaced", () => {
    const merged = withCourierEntries(
      [mine, { icon: "courier-config", extensions: ["old"] }],
      VSICONS_PLAN.files,
    );

    expect(merged).toEqual([mine, ...VSICONS_PLAN.files]);
    expect(hasCourierEntries(merged)).toBe(true);
  });

  it("come out again whole, the user's kept, nothing left as nothing", () => {
    expect(withoutCourierEntries([mine, ...VSICONS_PLAN.folders])).toEqual([mine]);
    expect(withoutCourierEntries(VSICONS_PLAN.files)).toBeUndefined();
    expect(hasCourierEntries([mine])).toBe(false);
  });

  it("name the folder's open and light looks as vscode-icons reads them, from the folder drawn in its style", () => {
    expect([...VSICONS_PLAN.copies]).toEqual([
      ["courier-config.svg", "file_type_courier-config.svg"],
      ["courier-mocks.svg", "file_type_courier-mocks.svg"],
      ["folder-courier-vsicons.svg", "folder_type_courier.svg"],
      ["folder-courier-vsicons-open.svg", "folder_type_courier_opened.svg"],
      ["folder-courier-vsicons-light.svg", "folder_type_light_courier.svg"],
      ["folder-courier-vsicons-light-open.svg", "folder_type_light_courier_opened.svg"],
    ]);
    expect(VSICONS_PLAN.folders).toEqual([
      { icon: "courier", extensions: [".courier"], format: "svg", light: true },
    ]);
  });
});
