/**
 * An icon theme's settings changed one at a time: each change once the
 * theme has rewritten itself for the one before — Material Icon Theme and
 * vscode-icons both rebuild on every change without waiting for a rebuild
 * under way — and the theme asked to apply its settings only when it
 * rewrote nothing, as when it does not run; a setting that already holds
 * the value left alone.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeThemeSettings, type RebuiltTheme } from "../src/icons/theme-rewrites";
import { settings, settingsChanged } from "./vscode-stand-in";

const FILES = "vsicons.associations.files";
const FOLDERS = "vsicons.associations.folders";

let theme: RebuiltTheme & { apply: ReturnType<typeof vi.fn> };
let written: string[];
const happened: string[] = [];

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "courier-theme-"));
  written = [join(root, "theme.json"), join(root, "theme-zed.json")];
  for (const file of written) writeFileSync(file, "{}");
  theme = { files: written, apply: vi.fn(async () => undefined) };
});

afterEach(() => {
  settings.clear();
  settingsChanged.length = 0;
  happened.length = 0;
});

describe("changing an icon theme's settings", () => {
  it("changes the next setting only once the theme has rewritten itself, and leaves it at that", async () => {
    settingsChanged.push((key) => {
      happened.push(`changed ${key}`);
      setTimeout(() => {
        for (const file of written) writeFileSync(file, JSON.stringify({ key }));
        happened.push(`rewrote for ${key}`);
      }, 150);
    });

    await changeThemeSettings(theme, [
      [FILES, [{ icon: "courier-config" }]],
      [FOLDERS, [{ icon: "courier" }]],
    ]);

    expect(happened).toEqual([
      `changed ${FILES}`,
      `rewrote for ${FILES}`,
      `changed ${FOLDERS}`,
      `rewrote for ${FOLDERS}`,
    ]);
    expect(theme.apply).not.toHaveBeenCalled();
  });

  it("asks the theme to apply its settings once when it rewrote nothing", async () => {
    await changeThemeSettings(theme, [
      [FILES, [{ icon: "courier-config" }]],
      [FOLDERS, [{ icon: "courier" }]],
    ]);

    expect(settings.get(FOLDERS)).toEqual([{ icon: "courier" }]);
    expect(theme.apply).toHaveBeenCalledTimes(1);
  }, 10_000);

  it("leaves the theme alone when nothing changed, and asks it to apply when only its icons did", async () => {
    settings.set(FILES, [{ icon: "courier-config" }]);

    await changeThemeSettings(theme, [[FILES, [{ icon: "courier-config" }]]]);
    const idle = theme.apply.mock.calls.length;
    await changeThemeSettings(theme, [[FILES, [{ icon: "courier-config" }]]], true);

    expect(idle).toBe(0);
    expect(theme.apply).toHaveBeenCalledTimes(1);
  });

  it("leaves a setting that already holds the value alone, and waits for no theme it cannot find", async () => {
    settings.set(FILES, [{ icon: "courier-config" }]);
    settingsChanged.push((key) => happened.push(`changed ${key}`));
    const started = Date.now();

    await changeThemeSettings({ files: [] }, [
      [FILES, [{ icon: "courier-config" }]],
      [FOLDERS, [{ icon: "courier" }]],
    ]);

    expect(happened).toEqual([`changed ${FOLDERS}`]);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
