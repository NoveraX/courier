/**
 * What a page of the application loads of Courier at start, built by the
 * bundler its target names as Next.js runs it — Turbopack, which no script
 * outside Next.js runs, or webpack — for each scenario `check:browser`
 * measures under esbuild, webpack and Vite, and against the same
 * scenario's budget for that target. The target installs a release of
 * Next.js, React and React Query: under Turbopack a run measures, byte for
 * byte, what the last one did, and under webpack the same releases can
 * come out some tens of bytes apart on another machine, within the room
 * the budget's rule leaves.
 * Only Courier's code counts, read through the build's source maps: React
 * and React Query are the application's own, as `check:browser` leaves
 * them out.
 */
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { type MeasuredTarget, SCENARIOS } from "../../../scripts/browser-bundles/scenarios.mjs";
import { browsers } from "../../support/browsers";
import { courierShare } from "../support/courier-share";
import { BUILDS } from "../support/prepare";
import { pageOf } from "../support/scenario-pages";
import { targetOf } from "../support/targets";

const target = targetOf(process.env.COURIER_FRAMEWORK);
const { bundle, id } = target;
if (bundle === undefined) throw new Error(`${id} names no bundler to hold to a budget`);
/* A range installs the newest release, and a release of Next.js, of React or of React Query may
   move a page by more than a budget's room: what a budget was measured on is installed again. */
for (const name of ["next", "react", "react-dom", "@tanstack/react-query"]) {
  const version = target.install[name];
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${id} installs ${name}@${version}: a target measured installs a release`);
  }
}
const release = target.install.next;
if (!isMeasured(id))
  throw new Error(`scripts/browser-bundles/scenarios.mjs has no budget for ${id}`);
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
    const [budget, budgetGzipped] = scenario.budget[id];
    test.info().annotations.push({
      type: id,
      description: `${bundle} of next@${release}: ${(bytes / KIB).toFixed(1)} KiB, ${(gzipped / KIB).toFixed(1)} KiB gzipped at start (budget ${budget}, ${budgetGzipped})`,
    });

    expect(bytes, "minified").toBeLessThanOrEqual(budget * KIB);
    expect(gzipped, "gzipped").toBeLessThanOrEqual(budgetGzipped * KIB);
  });
}

/* Whether every scenario keeps a budget under the target's id. */
function isMeasured(target: string): target is MeasuredTarget {
  return SCENARIOS.every((scenario) => Object.hasOwn(scenario.budget, target));
}
