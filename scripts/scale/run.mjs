#!/usr/bin/env node
/// <reference types="node" />
/**
 * Courier's scale tests: write the enterprise project — five APIs with a
 * thousand endpoints, the hundreds of files that call them, their
 * libraries, Courier's config and mocks — then measure everything Courier
 * runs on it, and hold each figure to its budget. Prints a report, writes
 * it as JSON when asked, and exits with 1 when a figure is over budget.
 *
 *   npm run test:scale
 *   node scripts/scale/run.mjs --endpoints 3000
 *   node scripts/scale/run.mjs --only studio,ui --json scale-report.json
 *
 * The steps: tsc, runtime, codegen, payloads, studio (with proxy, editor,
 * extension, mocks and ui inside it). Studio listens on --ports + 1, its mocks from
 * --ports + 10, the app on --ports.
 */
import { writeFileSync } from "node:fs";
import { arch, cpus, platform, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { argv, exit, version } from "node:process";
import { parseArgs } from "node:util";

import { enterpriseModel } from "./fixture/model.mjs";
import { portsOf } from "./fixture/project-code.mjs";
import { writeFixture } from "./fixture/write-fixture.mjs";
import { measureCodegen } from "./measure/codegen.mjs";
import { editorFigures } from "./measure/editor.mjs";
import { measureExtension } from "./measure/extension.mjs";
import { measured, report } from "./measure/metrics.mjs";
import { measureMocksLoad } from "./measure/mocks-load.mjs";
import { measurePayloads } from "./measure/payloads.mjs";
import { attachedApp, measureProxy } from "./measure/proxy.mjs";
import { measureRuntime } from "./measure/runtime.mjs";
import { measureStudio } from "./measure/studio.mjs";
import { measureStudioUi } from "./measure/studio-ui.mjs";
import { measureTypecheck } from "./measure/typecheck.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const STEPS = [
  "tsc",
  "runtime",
  "codegen",
  "payloads",
  "studio",
  "proxy",
  "editor",
  "extension",
  "mocks",
  "ui",
];
const { values } = parseArgs({
  args: argv.slice(2),
  options: {
    endpoints: { type: "string", default: "1000" },
    ports: { type: "string", default: "7400" },
    dir: { type: "string" },
    only: { type: "string" },
    json: { type: "string" },
  },
});
const endpoints = Number(values.endpoints);
const only = new Set(values.only ? values.only.split(",").map((step) => step.trim()) : STEPS);
const unknown = [...only].filter((step) => !STEPS.includes(step));
if (unknown.length > 0)
  throw new Error(`Unknown steps: ${unknown.join(", ")}. The steps are ${STEPS.join(", ")}.`);
const dir = resolve(values.dir ?? join(tmpdir(), "courier-scale", `e${endpoints}`));
const ports = portsOf(Number(values.ports));
const fixture = {
  dir,
  repo: REPO,
  endpoints,
  ports,
  sources: enterpriseModel({ endpoints }).sources.length,
};

console.log(`Writing the enterprise project: ${endpoints} endpoints in ${dir}`);
const written = writeFixture({ dir, repo: REPO, endpoints, portBase: ports.app });
const results = [
  measured("fixture.files", written.files, "files", Number.POSITIVE_INFINITY, {
    note: `${written.calls} call sites`,
  }),
];

/* A step that fails is a figure over its budget, and the steps after it still run. */
async function step(name, measure) {
  if (!only.has(name)) return;
  console.log(`Measuring ${name}…`);
  try {
    results.push(...(await measure()));
  } catch (error) {
    results.push(
      measured(`${name}.failed`, 1, "", 0, {
        note: error instanceof Error ? error.message.split("\n")[0] : String(error),
      }),
    );
  }
}

await step("tsc", () => measureTypecheck(fixture));
await step("runtime", () => measureRuntime(fixture));
await step("codegen", () => measureCodegen(fixture));
await step("payloads", () => measurePayloads(fixture));
await step("studio", () =>
  measureStudio(fixture, async (studio) => {
    const inside = [];
    const nested = async (name, measure) => {
      if (!only.has(name)) return;
      console.log(`Measuring ${name}…`);
      try {
        inside.push(...(await measure()));
      } catch (error) {
        inside.push(
          measured(`${name}.failed`, 1, "", 0, {
            note: error instanceof Error ? error.message.split("\n")[0] : String(error),
          }),
        );
      }
    };
    await nested("proxy", async () => [
      ...(await measureProxy({ ...fixture, label: "proxy", attach: false })),
      ...(await measureProxy({ ...fixture, label: "proxyStudio", attach: true })),
    ]);
    await nested("editor", () => editorFigures(studio.url, dir, "studio.editorAfterTraffic"));
    await nested("extension", () => measureExtension(fixture));
    await nested("mocks", () => measureMocksLoad(fixture, studio));
    await nested("ui", async () => {
      const app = await attachedApp(fixture);
      try {
        return await measureStudioUi(fixture, studio, () => app.traffic(3000));
      } finally {
        await app.stop();
      }
    });
    return inside;
  }),
);

console.log(`\n${report(results)}`);
const breached = results.filter((each) => !each.ok);
if (values.json) {
  const machine = {
    platform: platform(),
    arch: arch(),
    cpus: cpus().length,
    cpu: cpus()[0]?.model,
    memoryGb: Math.round(totalmem() / 2 ** 30),
    node: version,
  };
  writeFileSync(
    values.json,
    `${JSON.stringify({ at: new Date().toISOString(), endpoints, machine, results }, null, 2)}\n`,
  );
}
console.log(
  breached.length === 0
    ? "\nEvery figure is within its budget."
    : `\n${breached.length} over budget: ${breached.map((each) => each.name).join(", ")}`,
);
exit(breached.length === 0 ? 0 : 1);
