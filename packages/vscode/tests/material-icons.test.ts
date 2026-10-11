/**
 * Courier's icons in Material Icon Theme: each config and mocks file and
 * the `.courier` folder to Courier's icons, by their path from the theme's
 * `dist` folder; refused for a Courier outside the extensions folder; the
 * user's own associations kept, an older Courier's moved, and Courier's
 * taken out again whole.
 */
import { describe, expect, it } from "vitest";

import {
  isCourierIcon,
  materialPlan,
  withCourier,
  withoutCourier,
} from "../src/icons/material-icons";

const EXTENSIONS = "/opt/editor/extensions";
const ICONS = `${EXTENSIONS}/noverax.courier-vscode-1.2.0/media/icons`;
const MATERIAL = `${EXTENSIONS}/pkief.material-icon-theme-5.20.0`;

describe("Courier's associations for Material Icon Theme", () => {
  it("names each file and the .courier folder by the path from the theme's dist folder", () => {
    const plan = materialPlan(ICONS, MATERIAL);

    expect(plan).toMatchObject({
      files: {
        "courier.config.ts": "../../noverax.courier-vscode-1.2.0/media/icons/courier-config",
        "courier.config.cjs": "../../noverax.courier-vscode-1.2.0/media/icons/courier-config",
        "courier.mocks.mts": "../../noverax.courier-vscode-1.2.0/media/icons/courier-mocks",
      },
      folders: { ".courier": "../../noverax.courier-vscode-1.2.0/media/icons/folder-courier" },
    });
    expect(Object.keys("files" in plan ? plan.files : {})).toHaveLength(12);
  });

  it("says why when Courier runs from outside the extensions folder", () => {
    expect(materialPlan("/work/courier/packages/vscode/media/icons", MATERIAL)).toEqual({
      why: expect.stringContaining("only from the editor's extensions folder"),
    });
  });
});

describe("Courier's associations among the user's", () => {
  const ours = {
    "courier.config.ts": "../../noverax.courier-vscode-1.2.0/media/icons/courier-config",
  };

  it("keeps the user's own, an own icon for a Courier file too, and moves an older Courier's", () => {
    expect(withCourier({ "*.sample": "../../icons/sample" }, ours)).toEqual({
      "*.sample": "../../icons/sample",
      ...ours,
    });
    expect(withCourier({ "courier.config.ts": "typescript" }, ours)).toEqual({
      "courier.config.ts": "typescript",
    });
    expect(
      withCourier(
        { "courier.config.ts": "../../noverax.courier-vscode-1.1.0/media/icons/courier-config" },
        ours,
      ),
    ).toEqual(ours);
  });

  it("takes Courier's out and leaves nothing when nothing else was there", () => {
    expect(withoutCourier({ ...ours, "*.sample": "../../icons/sample" })).toEqual({
      "*.sample": "../../icons/sample",
    });
    expect(withoutCourier(ours)).toBeUndefined();
    expect(withoutCourier(undefined)).toBeUndefined();
  });

  it("knows Courier's icons from any version, and nothing else", () => {
    expect(isCourierIcon("../../noverax.courier-vscode-9.0.0/media/icons/folder-courier")).toBe(
      true,
    );
    expect(isCourierIcon("../../icons/courier-config-of-mine")).toBe(false);
    expect(isCourierIcon(42)).toBe(false);
  });
});
