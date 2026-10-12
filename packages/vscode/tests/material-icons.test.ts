/**
 * Courier's icons in Material Icon Theme: each config and mocks file to
 * Courier's icons in their folder beside the theme, by their path from the
 * theme's `icons` folder, and the `.courier` folder by the path the theme
 * reads after naming its icon `folder-` and the path — naming no version
 * of Courier, so they stay the same across updates and machines; the
 * user's own associations kept, an older Courier's moved, and Courier's
 * taken out again whole.
 */
import { describe, expect, it } from "vitest";

import {
  iconsHomeOf,
  isCourierIcon,
  materialPlan,
  withCourier,
  withoutCourier,
} from "../src/icons/material-icons";

describe("Courier's associations for Material Icon Theme", () => {
  it("names each file by its path from the theme's icons folder, and the folder from one deeper", () => {
    const plan = materialPlan();

    expect(plan).toMatchObject({
      files: {
        "courier.config.ts": "../../.noverax-courier-icons/courier-config",
        "courier.config.cjs": "../../.noverax-courier-icons/courier-config",
        "courier.mocks.mts": "../../.noverax-courier-icons/courier-mocks",
      },
      folders: { ".courier": "../../../../.noverax-courier-icons/folder-courier" },
    });
    expect(Object.keys(plan.files)).toHaveLength(12);
  });

  it("keeps the icons beside the theme, in the editor's extensions folder", () => {
    expect(iconsHomeOf("/opt/editor/extensions/pkief.material-icon-theme-5.39.0")).toBe(
      "/opt/editor/extensions/.noverax-courier-icons",
    );
  });
});

describe("Courier's associations among the user's", () => {
  const ours = { "courier.config.ts": "../../.noverax-courier-icons/courier-config" };

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

  it("knows Courier's icons in their folder and in any version's media, and nothing else", () => {
    expect(isCourierIcon("../../../../.noverax-courier-icons/folder-courier")).toBe(true);
    expect(isCourierIcon("../../noverax.courier-vscode-9.0.0/media/icons/folder-courier")).toBe(
      true,
    );
    expect(isCourierIcon("../../xnoverax-courier-icons/courier-config")).toBe(false);
    expect(isCourierIcon("../../icons/courier-config-of-mine")).toBe(false);
    expect(isCourierIcon(42)).toBe(false);
  });
});
