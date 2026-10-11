/**
 * vscode-icons' settings changed one at a time: each change once
 * vscode-icons has rewritten its theme for the one before — two rewrites at
 * once leave it a file it cannot read — and its own command run only when
 * it rewrote nothing, as when it does not run.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VSICONS_APPLY, VSICONS_FILES, VSICONS_FOLDERS } from "../src/icons/vscode-icons";
import { changeVsicons } from "../src/icons/vsicons-rewrites";
import { elsewhere, executed, installed, settings, settingsChanged } from "./vscode-stand-in";

let theme: string;
let zed: string;
const happened: string[] = [];

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "courier-vsicons-"));
  mkdirSync(join(root, "dist", "src"), { recursive: true });
  theme = join(root, "dist", "src", "vsicons-icon-theme.json");
  zed = join(root, "dist", "src", "vsicons-icon-theme-zed.json");
  writeFileSync(theme, "{}");
  writeFileSync(zed, "{}");
  installed.set("vscode-icons-team.vscode-icons", { extensionPath: root });
  elsewhere.push(VSICONS_APPLY);
});

afterEach(() => {
  settings.clear();
  installed.clear();
  settingsChanged.length = 0;
  elsewhere.length = 0;
  executed.length = 0;
  happened.length = 0;
});

describe("changing vscode-icons' settings", () => {
  it("changes the next setting only once vscode-icons has rewritten its theme, and leaves it at that", async () => {
    settingsChanged.push((key) => {
      happened.push(`changed ${key}`);
      setTimeout(() => {
        writeFileSync(theme, JSON.stringify({ key }));
        writeFileSync(zed, JSON.stringify({ key }));
        happened.push(`rewrote for ${key}`);
      }, 150);
    });

    await changeVsicons([
      [VSICONS_FILES, [{ icon: "courier-config" }]],
      [VSICONS_FOLDERS, [{ icon: "courier" }]],
    ]);

    expect(happened).toEqual([
      `changed ${VSICONS_FILES}`,
      `rewrote for ${VSICONS_FILES}`,
      `changed ${VSICONS_FOLDERS}`,
      `rewrote for ${VSICONS_FOLDERS}`,
    ]);
    expect(executed).toEqual([]);
  });

  it("runs vscode-icons' own command once when vscode-icons rewrote nothing", async () => {
    await changeVsicons([
      [VSICONS_FILES, [{ icon: "courier-config" }]],
      [VSICONS_FOLDERS, [{ icon: "courier" }]],
    ]);

    expect(settings.get(VSICONS_FOLDERS)).toEqual([{ icon: "courier" }]);
    expect(executed).toEqual([[VSICONS_APPLY]]);
  }, 10_000);

  it("leaves a setting that already holds the value alone", async () => {
    settings.set(VSICONS_FILES, [{ icon: "courier-config" }]);
    settingsChanged.push((key) => happened.push(`changed ${key}`));
    installed.clear();

    await changeVsicons([[VSICONS_FILES, [{ icon: "courier-config" }]]]);

    expect(happened).toEqual([]);
  });
});
