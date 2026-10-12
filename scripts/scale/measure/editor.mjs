/**
 * What an editor asks Studio as it shows a project — every endpoint's
 * figures every few seconds, the requests, the audit's findings, the calls
 * in the file open and where each endpoint is declared — each timed the
 * first time, when Studio works it out, and after, when it keeps it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { measured, percentiles } from "./metrics.mjs";

/**
 * Ask Studio what the editor asks, and time it.
 *
 * @param {string} url - Studio's address
 * @param {string} dir - The project
 * @param {string} label - What the figures are named under: `studio.editor`
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await editorFigures("http://127.0.0.1:7401", dir, "studio.editorAfterTraffic");
 * ```
 */
export async function editorFigures(url, dir, label) {
  const file = sampleAppFile(dir);
  const ask = async (path, body) => {
    const samples = [];
    let size = 0;
    for (let run = 0; run < 12; run++) {
      const begun = performance.now();
      const response = await fetch(`${url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      size = (await response.arrayBuffer()).byteLength;
      samples.push(performance.now() - begun);
    }
    return { first: samples[0] ?? 0, p50: percentiles(samples.slice(2)).p50, size };
  };
  const figures = [
    ["endpoints", await ask("/api/editor/endpoints", {}), "every endpoint's figures"],
    ["requests", await ask("/api/editor/requests", { limit: 50 }), "the latest 50 requests"],
    ["findings", await ask("/api/editor/findings", {}), "the audit's findings at the calls"],
    [
      "calls",
      await ask("/api/editor/calls", { file, text: readFileSync(file, "utf8") }),
      "the calls in one file",
    ],
    ["definitions", await ask("/api/editor/definitions", {}), "where each endpoint is declared"],
  ];
  return figures.flatMap(([name, timing, what]) => [
    measured(`${label}.${name}`, timing.p50, "ms", 50, {
      note: `${what}, ${Math.round(timing.size / 1024)} KB`,
    }),
    measured(`${label}.${name}.first`, timing.first, "ms", 1_000, { note: "worked out, not kept" }),
  ]);
}

/* The first of the app's files, by name: one that calls the API five times. */
function sampleAppFile(dir) {
  const app = join(dir, "src/app");
  const area = readdirSync(app).sort()[0] ?? "";
  const file = readdirSync(join(app, area)).sort()[0] ?? "";
  return join(app, area, file);
}
