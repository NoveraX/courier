/**
 * Courier's icons in the icon themes, following the user's settings:
 * put in — copied beside Material Icon Theme or into vscode-icons' custom
 * icons folder, with the associations after the user's own — and taken out
 * again; and on every start, as the settings say: copied where Settings
 * Sync brought the associations from another machine, an older Courier's
 * paths moved to the folder that names no version, Courier's changed icons
 * copied again, and the copies taken away once the settings hold none.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyIcons, hasCourierIcons, keepIconsCurrent, removeIcons } from "../src/apply-icons";
import type { CourierIcons } from "../src/icon-files";
import {
  elsewhere,
  env,
  executed,
  installed,
  settings,
  workspace,
  workspaceSettings,
} from "./vscode-stand-in";

const FILES = "material-icon-theme.files.associations";
const FOLDERS = "material-icon-theme.folders.associations";
const ICONS = ["courier-config", "courier-mocks", "folder-courier", "folder-courier-open"];
const VSICONS_FOLDERS = [
  "folder-courier-vsicons",
  "folder-courier-vsicons-open",
  "folder-courier-vsicons-light",
  "folder-courier-vsicons-light-open",
];

/* The icons in a folder of copies, without what Courier keeps beside them. */
const copiesIn = (folder: string) =>
  readdirSync(folder)
    .filter((name) => name.endsWith(".svg"))
    .sort();

let iconsDir: string;
let icons: CourierIcons;
let home: string;
let custom: string;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "courier-icons-"));
  iconsDir = join(root, "extensions", "noverax.courier-vscode-1.2.0", "media", "icons");
  mkdirSync(iconsDir, { recursive: true });
  icons = { dir: iconsDir, profile: "profile-a" };
  for (const name of [...ICONS, ...VSICONS_FOLDERS]) {
    writeFileSync(join(iconsDir, `${name}.svg`), `<svg id="${name}"/>`);
  }
  installed.set("PKief.material-icon-theme", {
    extensionPath: join(root, "extensions", "pkief.material-icon-theme-5.39.0"),
  });
  installed.set("vscode-icons-team.vscode-icons", {
    extensionPath: join(root, "extensions", "vscode-icons-team.vscode-icons-13.0.0"),
    isActive: true,
  });
  home = join(root, "extensions", ".noverax-courier-icons");
  custom = join(root, "team-icons", "vsicons-custom-icons");
  settings.set("vsicons.customIconFolderPath", join(root, "team-icons"));
  elsewhere.push("vscode-icons.regenerateIcons");
});

afterEach(() => {
  settings.clear();
  workspaceSettings.clear();
  workspace.isTrusted = true;
  env.remoteName = undefined;
  installed.clear();
  elsewhere.length = 0;
  executed.length = 0;
});

describe("Courier's icons in Material Icon Theme", () => {
  it("copies the icons beside the theme and adds paths to them, keeping the user's own for a Courier file", async () => {
    settings.set(FILES, { "courier.mocks.ts": "typescript" });

    expect(await applyIcons(icons, "material")).toBeUndefined();

    expect(copiesIn(home)).toEqual(ICONS.map((name) => `${name}.svg`).sort());
    expect(settings.get(FILES)).toMatchObject({
      "courier.config.ts": "../../.noverax-courier-icons/courier-config",
      "courier.mocks.ts": "typescript",
    });
    expect(settings.get(FOLDERS)).toEqual({
      ".courier": "../../../../.noverax-courier-icons/folder-courier",
    });
    expect(hasCourierIcons("material")).toBe(true);
  });

  it("takes the paths out, the user's kept, and the icons' folder with them", async () => {
    settings.set(FILES, { "*.sample": "../../icons/sample" });
    await applyIcons(icons, "material");

    await removeIcons(icons);

    expect(settings.get(FILES)).toEqual({ "*.sample": "../../icons/sample" });
    expect(settings.has(FOLDERS)).toBe(false);
    expect(existsSync(home)).toBe(false);
  });

  it("copies the icons on a machine Settings Sync brought the paths to, the paths left as they are", async () => {
    await applyIcons(icons, "material");
    const synced = { files: settings.get(FILES), folders: settings.get(FOLDERS) };
    await removeIcons(icons);
    settings.set(FILES, synced.files);
    settings.set(FOLDERS, synced.folders);

    await keepIconsCurrent(icons);

    expect(copiesIn(home)).toHaveLength(4);
    expect(settings.get(FILES)).toEqual(synced.files);
    expect(settings.get(FOLDERS)).toEqual(synced.folders);
  });

  it("moves an older Courier's paths, which named its version, to the icons' folder", async () => {
    settings.set(FILES, {
      "courier.config.ts": "../../noverax.courier-vscode-1.1.0/media/icons/courier-config",
      "*.sample": "../../icons/sample",
    });
    settings.set(FOLDERS, {
      ".courier": "../../noverax.courier-vscode-1.1.0/media/icons/folder-courier",
    });

    await keepIconsCurrent(icons);

    expect(settings.get(FILES)).toEqual({
      "courier.config.ts": "../../.noverax-courier-icons/courier-config",
      "*.sample": "../../icons/sample",
    });
    expect(settings.get(FOLDERS)).toEqual({
      ".courier": "../../../../.noverax-courier-icons/folder-courier",
    });
    expect(copiesIn(home)).toHaveLength(4);
  });

  it("takes the copies away once the settings hold none, as when they were taken out on another machine", async () => {
    await applyIcons(icons, "material");
    settings.delete(FILES);
    settings.delete(FOLDERS);

    await keepIconsCurrent(icons);

    expect(existsSync(home)).toBe(false);
  });

  it("says when the theme is not installed", async () => {
    installed.clear();

    expect(await applyIcons(icons, "material")).toBe("Material Icon Theme is not installed.");
  });
});

describe("Courier's icons in vscode-icons", () => {
  it("starts vscode-icons first when it has not started, so that it hears the request to apply", async () => {
    const started: string[] = [];
    installed.set("vscode-icons-team.vscode-icons", {
      extensionPath: join(iconsDir, "..", "..", "..", "vscode-icons-team.vscode-icons-13.0.0"),
      isActive: false,
      activate: async () => {
        started.push("activated");
        return undefined;
      },
    });
    settings.set("vsicons.associations.files", [
      { icon: "courier-config", extensions: ["courier.config.ts"] },
    ]);

    await keepIconsCurrent(icons);

    expect(started).toEqual(["activated"]);
    expect(executed).toEqual([["vscode-icons.regenerateIcons"]]);
  });

  it("copies the icons, adds the entries after the user's own, and applies them", async () => {
    const mine = { icon: "my-icon", extensions: ["mai"], format: "svg" };
    settings.set("vsicons.associations.files", [mine]);

    expect(await applyIcons(icons, "vsicons")).toBeUndefined();

    expect(readdirSync(custom).sort()).toEqual([
      "file_type_courier-config.svg",
      "file_type_courier-mocks.svg",
      "folder_type_courier.svg",
      "folder_type_courier_opened.svg",
      "folder_type_light_courier.svg",
      "folder_type_light_courier_opened.svg",
    ]);
    expect(settings.get("vsicons.associations.files")).toEqual([
      mine,
      expect.objectContaining({ icon: "courier-config", filename: true }),
      expect.objectContaining({ icon: "courier-mocks" }),
    ]);
    expect(settings.get("vsicons.associations.folders")).toEqual([
      { icon: "courier", extensions: [".courier"], format: "svg", light: true },
    ]);
    expect(executed).toContainEqual(["vscode-icons.regenerateIcons"]);
  });

  it("gives vscode-icons the folder drawn as it draws its own, and Material Icon Theme the one drawn as it does", async () => {
    await applyIcons(icons, "vsicons");
    await applyIcons(icons, "material");

    expect(readFileSync(join(custom, "folder_type_courier.svg"), "utf8")).toBe(
      '<svg id="folder-courier-vsicons"/>',
    );
    expect(readFileSync(join(custom, "folder_type_courier_opened.svg"), "utf8")).toBe(
      '<svg id="folder-courier-vsicons-open"/>',
    );
    expect(readFileSync(join(home, "folder-courier.svg"), "utf8")).toBe(
      '<svg id="folder-courier"/>',
    );
  });

  it("takes them out again, the user's own kept", async () => {
    const mine = { icon: "my-icon", extensions: ["mai"], format: "svg" };
    settings.set("vsicons.associations.files", [mine]);
    await applyIcons(icons, "vsicons");

    await removeIcons(icons);

    expect(settings.get("vsicons.associations.files")).toEqual([mine]);
    expect(settings.has("vsicons.associations.folders")).toBe(false);
    expect(readdirSync(custom)).toEqual([]);
  });

  it("copies the icons and applies them on a machine Settings Sync brought the entries to", async () => {
    await applyIcons(icons, "vsicons");
    const synced = settings.get("vsicons.associations.files");
    await removeIcons(icons);
    settings.set("vsicons.associations.files", synced);
    executed.length = 0;

    await keepIconsCurrent(icons);

    expect(readdirSync(custom)).toHaveLength(6);
    expect(executed).toEqual([["vscode-icons.regenerateIcons"]]);
  });

  it("brings an older Courier's entries up to this one's, the folder's light look included", async () => {
    settings.set("vsicons.associations.folders", [
      { icon: "courier", extensions: [".courier"], format: "svg" },
    ]);
    executed.length = 0;

    await keepIconsCurrent(icons);

    expect(settings.get("vsicons.associations.folders")).toEqual([
      { icon: "courier", extensions: [".courier"], format: "svg", light: true },
    ]);
    expect(settings.has("vsicons.associations.files")).toBe(false);
  });

  it("copies again after Courier's icons changed, and does nothing while they are current", async () => {
    await applyIcons(icons, "vsicons");
    executed.length = 0;
    await keepIconsCurrent(icons);
    const idle = executed.length;
    writeFileSync(join(iconsDir, "courier-config.svg"), "<svg id='redrawn'/>");

    await keepIconsCurrent(icons);

    expect(idle).toBe(0);
    expect(readFileSync(join(custom, "file_type_courier-config.svg"), "utf8")).toBe(
      "<svg id='redrawn'/>",
    );
    expect(executed).toEqual([["vscode-icons.regenerateIcons"]]);
  });

  it("takes the copies away once no settings hold the entries, and has vscode-icons rebuild without them", async () => {
    await applyIcons(icons, "vsicons");
    settings.delete("vsicons.associations.files");
    settings.delete("vsicons.associations.folders");
    executed.length = 0;

    await keepIconsCurrent(icons);
    const rebuilt = [...executed];
    await keepIconsCurrent(icons);

    expect(readdirSync(custom)).toEqual([]);
    expect(hasCourierIcons("vsicons")).toBe(false);
    expect(rebuilt).toEqual([["vscode-icons.regenerateIcons"]]);
    expect(executed).toEqual(rebuilt);
  });
});

describe("Courier's icons in several profiles on one computer", () => {
  it("leaves the copies another profile uses alone in a profile that never put them in", async () => {
    await applyIcons(icons, "material");
    await applyIcons(icons, "vsicons");
    /* The other profile's settings are its own, without Courier's associations. */
    for (const key of [
      FILES,
      FOLDERS,
      "vsicons.associations.files",
      "vsicons.associations.folders",
    ]) {
      settings.delete(key);
    }
    executed.length = 0;

    await keepIconsCurrent({ dir: iconsDir, profile: "profile-b" });

    expect(copiesIn(home)).toHaveLength(4);
    expect(copiesIn(custom)).toHaveLength(6);
    expect(executed).toEqual([]);
  });

  it("keeps the copies while another profile still uses them, and takes them with the last", async () => {
    const other = { dir: iconsDir, profile: "profile-b" };
    await applyIcons(icons, "material");
    await applyIcons(other, "material");

    await removeIcons(other);
    const kept = copiesIn(home);
    await removeIcons(icons);

    expect(kept).toHaveLength(4);
    expect(existsSync(home)).toBe(false);
  });
});

describe("an icon theme that does not run here", () => {
  it("takes no icons and is said not to be installed, nothing written", async () => {
    installed.delete("vscode-icons-team.vscode-icons");

    const why = await applyIcons(icons, "vsicons");

    expect(why).toBe("vscode-icons is not installed.");
    expect(existsSync(custom)).toBe(false);
    expect(settings.has("vsicons.associations.files")).toBe(false);
  });

  it("is said to run on the remote machine in a remote window, where its icons cannot be written from here", async () => {
    installed.clear();
    env.remoteName = "ssh-remote";

    const why = await applyIcons(icons, "material");

    expect(why).toContain(
      "Material Icon Theme does not run on this computer in this remote window",
    );
    expect(existsSync(home)).toBe(false);
    expect(settings.has(FILES)).toBe(false);
  });
});

describe("Courier's icons a workspace's own settings name", () => {
  it("are copied for a workspace the user trusts, as a team shares its icons, and not for one not trusted", async () => {
    workspaceSettings.set("vsicons.associations.files", [
      { icon: "courier-config", extensions: ["courier.config.ts"], filename: true, format: "svg" },
    ]);
    workspace.isTrusted = false;
    await keepIconsCurrent(icons);
    const untrusted = existsSync(custom);
    workspace.isTrusted = true;

    await keepIconsCurrent(icons);

    expect(untrusted).toBe(false);
    expect(copiesIn(custom)).toHaveLength(6);
    expect(executed).toEqual([["vscode-icons.regenerateIcons"]]);
  });
});

describe("vscode-icons' custom icons folder in a workspace not trusted", () => {
  it("comes from the user's settings alone, so the workspace cannot choose where Courier writes", async () => {
    const chosen = join(custom, "..", "..", "chosen-by-workspace");
    workspaceSettings.set("vsicons.customIconFolderPath", chosen);
    workspace.isTrusted = false;

    await applyIcons(icons, "vsicons");

    expect(copiesIn(custom)).toHaveLength(6);
    expect(existsSync(chosen)).toBe(false);
  });

  it("comes from the workspace's settings once it is trusted, as vscode-icons reads it", async () => {
    const chosen = join(custom, "..", "..", "chosen-by-workspace");
    workspaceSettings.set("vsicons.customIconFolderPath", chosen);

    await applyIcons(icons, "vsicons");

    expect(copiesIn(join(chosen, "vsicons-custom-icons"))).toHaveLength(6);
  });
});
