/**
 * Whether an icon theme's built file names Courier's icons: it does, it
 * does not, or it cannot be read — when the theme has not built it yet.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { builtWithCourier } from "../src/built-theme";

describe("an icon theme's built file", () => {
  it("names Courier's icons, or does not, or cannot be read", async () => {
    const folder = mkdtempSync(join(tmpdir(), "courier-built-"));
    const withThem = join(folder, "with.json");
    const without = join(folder, "without.json");
    writeFileSync(withThem, '{"iconPath":"../../.noverax-courier-icons/courier-config.svg"}');
    writeFileSync(without, '{"iconPath":"../icons/typescript.svg"}');

    const found = await Promise.all([
      builtWithCourier(withThem, ".noverax-courier-icons"),
      builtWithCourier(without, ".noverax-courier-icons"),
      builtWithCourier(join(folder, "missing.json"), ".noverax-courier-icons"),
    ]);

    expect(found).toEqual([true, false, undefined]);
  });
});
