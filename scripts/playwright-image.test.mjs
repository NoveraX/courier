/**
 * Self-test for `scripts/playwright-image.mjs`: the image named after the
 * release of Playwright a lockfile pins, and the lockfiles no image is
 * named after.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playwrightImage } from "./playwright-image.mjs";

const pinning = (version) => ({ packages: { "node_modules/playwright-core": { version } } });
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("the image for the Playwright a lockfile pins", () => {
  it("is Playwright's own Ubuntu 24.04 image of that release", () => {
    expect(playwrightImage(pinning("1.64.0"))).toBe("mcr.microsoft.com/playwright:v1.64.0-noble");
  });

  it("keeps a prerelease's tag whole", () => {
    expect(playwrightImage(pinning("1.65.0-beta-1761500000000"))).toBe(
      "mcr.microsoft.com/playwright:v1.65.0-beta-1761500000000-noble",
    );
  });

  it("carries the browsers of the Playwright this checkout installed", () => {
    const { version } = readJson("../node_modules/playwright-core/package.json");

    expect(playwrightImage(readJson("../package-lock.json"))).toBe(
      `mcr.microsoft.com/playwright:v${version}-noble`,
    );
  });
});

describe("a lockfile no image is named after", () => {
  it("is refused when it pins no playwright-core", () => {
    expect(() => playwrightImage({ packages: {} })).toThrow(
      "package-lock.json pins no release of playwright-core an image is named after: undefined",
    );
  });

  it("is refused when its version would put anything but a release in the name", () => {
    for (const version of [
      "latest",
      "1.64",
      "v1.64.0",
      "1.64.0 --privileged",
      "1.64.0\nimage=x",
      1.64,
    ]) {
      expect(() => playwrightImage(pinning(version))).toThrow(
        "pins no release of playwright-core an image is named after",
      );
    }
  });

  it("is refused when it is no lockfile at all", () => {
    for (const lockfile of [null, undefined, "", [], { packages: null }]) {
      expect(() => playwrightImage(lockfile)).toThrow(
        "pins no release of playwright-core an image is named after",
      );
    }
  });
});
