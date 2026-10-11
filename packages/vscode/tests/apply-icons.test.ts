/**
 * Putting Courier's icons into an icon theme and taking them out, through
 * the user's settings: vscode-icons gets Courier's icons copied into its
 * custom icons folder and its own command run; Material Icon Theme gets
 * paths to the icons Courier ships; the user's own associations stay; and
 * after an update, the copies and the paths are brought up to date — but
 * what the user took out stays out.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyIcons, keepIconsCurrent, removeIcons } from "../src/icons/apply-icons";
import { elsewhere, executed, installed, settings } from "./vscode-stand-in";

let iconsDir: string;
let custom: string;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "courier-icons-"));
  iconsDir = join(root, "extensions", "noverax.courier-vscode-1.2.0", "media", "icons");
  mkdirSync(iconsDir, { recursive: true });
  for (const name of ["courier-config", "courier-mocks", "folder-courier", "folder-courier-open"]) {
    writeFileSync(join(iconsDir, `${name}.svg`), `<svg id="${name}"/>`);
  }
  installed.set("PKief.material-icon-theme", {
    extensionPath: join(root, "extensions", "pkief.material-icon-theme-5.20.0"),
  });
  custom = join(root, "team-icons");
  settings.set("vsicons.customIconFolderPath", custom);
  elsewhere.push("vscode-icons.regenerateIcons");
});

afterEach(() => {
  settings.clear();
  installed.clear();
  elsewhere.length = 0;
  executed.length = 0;
});

describe("Courier's icons in vscode-icons", () => {
  it("copies the icons, adds the entries after the user's own, and applies them", async () => {
    const mine = { icon: "my-icon", extensions: ["mai"], format: "svg" };
    settings.set("vsicons.associations.files", [mine]);

    expect(await applyIcons(iconsDir, "vsicons")).toBeUndefined();

    expect(readdirSync(join(custom, "vsicons-custom-icons")).sort()).toEqual([
      "file_type_courier-config.svg",
      "file_type_courier-mocks.svg",
      "folder_type_courier.svg",
      "folder_type_courier_opened.svg",
    ]);
    expect(settings.get("vsicons.associations.files")).toEqual([
      mine,
      expect.objectContaining({ icon: "courier-config", filename: true }),
      expect.objectContaining({ icon: "courier-mocks" }),
    ]);
    expect(settings.get("vsicons.associations.folders")).toEqual([
      { icon: "courier", extensions: [".courier"], format: "svg" },
    ]);
    expect(executed).toContainEqual(["vscode-icons.regenerateIcons"]);
  });

  it("takes them out again, the user's own kept", async () => {
    const mine = { icon: "my-icon", extensions: ["mai"], format: "svg" };
    settings.set("vsicons.associations.files", [mine]);
    await applyIcons(iconsDir, "vsicons");

    await removeIcons("vsicons");

    expect(settings.get("vsicons.associations.files")).toEqual([mine]);
    expect(settings.has("vsicons.associations.folders")).toBe(false);
    expect(readdirSync(join(custom, "vsicons-custom-icons"))).toEqual([]);
  });

  it("copies the icons again after an update, unless the user took Courier's entries out", async () => {
    await applyIcons(iconsDir, "vsicons");
    writeFileSync(join(iconsDir, "courier-config.svg"), "<svg id='redrawn'/>");

    await keepIconsCurrent(iconsDir, "vsicons");
    const copy = join(custom, "vsicons-custom-icons", "file_type_courier-config.svg");
    const refreshed = readFileSync(copy, "utf8");
    settings.delete("vsicons.associations.files");
    writeFileSync(join(iconsDir, "courier-config.svg"), "<svg id='again'/>");
    await keepIconsCurrent(iconsDir, "vsicons");

    expect(refreshed).toBe("<svg id='redrawn'/>");
    expect(readFileSync(copy, "utf8")).toBe("<svg id='redrawn'/>");
  });
});

describe("Courier's icons in Material Icon Theme", () => {
  it("adds paths to Courier's icons, keeping the user's own for a Courier file", async () => {
    settings.set("material-icon-theme.files.associations", { "courier.mocks.ts": "typescript" });

    expect(await applyIcons(iconsDir, "material")).toBeUndefined();

    const files = settings.get("material-icon-theme.files.associations");
    expect(files).toMatchObject({
      "courier.config.ts": "../../noverax.courier-vscode-1.2.0/media/icons/courier-config",
      "courier.mocks.ts": "typescript",
    });
    expect(settings.get("material-icon-theme.folders.associations")).toEqual({
      ".courier": "../../../../noverax.courier-vscode-1.2.0/media/icons/folder-courier",
    });
  });

  it("moves the paths to a new version's folder, and says when the theme is not installed", async () => {
    settings.set("material-icon-theme.files.associations", {
      "courier.config.ts": "../../noverax.courier-vscode-1.1.0/media/icons/courier-config",
      "*.sample": "../../icons/sample",
    });

    await keepIconsCurrent(iconsDir, "material");
    installed.clear();

    expect(settings.get("material-icon-theme.files.associations")).toEqual({
      "courier.config.ts": "../../noverax.courier-vscode-1.2.0/media/icons/courier-config",
      "*.sample": "../../icons/sample",
    });
    expect(await applyIcons(iconsDir, "material")).toBe("Material Icon Theme is not installed.");
  });

  it("takes Courier's paths out, the user's kept", async () => {
    settings.set("material-icon-theme.files.associations", { "*.sample": "../../icons/sample" });
    await applyIcons(iconsDir, "material");

    await removeIcons("material");

    expect(settings.get("material-icon-theme.files.associations")).toEqual({
      "*.sample": "../../icons/sample",
    });
    expect(settings.has("material-icon-theme.folders.associations")).toBe(false);
  });
});
