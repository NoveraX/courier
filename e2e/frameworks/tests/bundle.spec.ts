/**
 * What a page of the application loads of Courier at start, built by the
 * bundler its target names — Turbopack, which no script outside Next.js
 * runs — for each scenario `check:browser` measures under esbuild, webpack
 * and Vite, and against the same scenario's budget for that bundler.
 * Only Courier's code counts, read through the build's source maps: React
 * and React Query are the application's own, as `check:browser` leaves
 * them out.
 */
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { SCENARIOS } from "../../../scripts/browser-bundles/scenarios.mjs";
import { browsers } from "../../support/browsers";
import { courierShare } from "../support/courier-share";
import { BUILDS } from "../support/prepare";
import { pageOf } from "../support/scenario-pages";
import { targetOf } from "../support/targets";

const target = targetOf(process.env.COURIER_FRAMEWORK);
const { bundle } = target;
if (bundle === undefined) throw new Error(`${target.id} names no bundler to hold to a budget`);
const KIB = 1024;

/* Next.js's own files a page may load a copy of at start with no source map, by their path in its
   package: Turbopack names a chunk by a hash, so no chunk's name would do, and the copy is read
   byte for byte against the file, so a chunk that held anything more would stop the reading. */
const PREBUILT = [
  /* The polyfills Next.js ships built for a browser that runs no modules — `noModule` keeps every
     other browser from them — copied as they ship: no module of an application goes into them. */
  "next/dist/build/polyfills/polyfill-nomodule.js",
];

for (const scenario of SCENARIOS) {
  test(`${scenario.name}: a page loads within its budget at start`, () => {
    /* What the build holds is the same whatever the browser; the first engine reads it. */
    test.skip(test.info().project.name !== browsers()[0], "read once, by the first browser");
    const page = pageOf(scenario.name);
    const { bytes, gzipped } = courierShare(
      join(BUILDS, target.id),
      page,
      (source) => source.includes("/@noverax/") || source.includes(`app/${page}/`),
      `app/${page}/`,
      PREBUILT,
    );
    const [budget, budgetGzipped] = scenario.budget[bundle];
    test.info().annotations.push({
      type: bundle,
      description: `${(bytes / KIB).toFixed(1)} KiB, ${(gzipped / KIB).toFixed(1)} KiB gzipped at start (budget ${budget}, ${budgetGzipped})`,
    });

    expect(bytes, "minified").toBeLessThanOrEqual(budget * KIB);
    expect(gzipped, "gzipped").toBeLessThanOrEqual(budgetGzipped * KIB);
  });
}
