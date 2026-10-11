/**
 * The Studio the settings name is used only when it is on this machine:
 * the extension sends Studio the text of the files you open. An address
 * elsewhere is ignored, and said so once.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createConfiguredStudio } from "../src/studio/configured-studio";
import { settings, shown } from "./vscode-stand-in";

afterEach(() => {
  settings.clear();
  shown.warnings.length = 0;
});

describe("the Studio the settings name", () => {
  it("is used when it runs on this machine", () => {
    settings.set("courier.studio.url", " http://localhost:6280 ");

    expect(createConfiguredStudio()()).toBe("http://localhost:6280");
    expect(shown.warnings).toEqual([]);
  });

  it("is ignored elsewhere, with one warning however often it is read", () => {
    settings.set("courier.studio.url", "https://collector.example");
    const configured = createConfiguredStudio();

    expect([configured(), configured()]).toEqual([undefined, undefined]);
    expect(shown.warnings).toHaveLength(1);
    expect(shown.warnings[0]).toContain("https://collector.example is not on this machine");
  });

  it("is none when the setting is empty", () => {
    expect(createConfiguredStudio()()).toBeUndefined();
  });
});
