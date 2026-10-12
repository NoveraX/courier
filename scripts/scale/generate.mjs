#!/usr/bin/env node
/// <reference types="node" />
/**
 * Write the enterprise project the scale tests measure: a company's five
 * APIs with a thousand endpoints, the code that calls them from hundreds of
 * files, its internal libraries, and Courier's config and mocks.
 *
 *   node scripts/scale/generate.mjs                       1000 endpoints, in the system's temp folder
 *   node scripts/scale/generate.mjs --endpoints 3000      a larger company
 *   node scripts/scale/generate.mjs --dir /tmp/big        somewhere else
 *
 * Prints what it wrote, as JSON.
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { writeFixture } from "./fixture/write-fixture.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const { values } = parseArgs({
  args: argv.slice(2),
  options: {
    endpoints: { type: "string", default: "1000" },
    records: { type: "string", default: "200" },
    ports: { type: "string", default: "7400" },
    dir: { type: "string" },
  },
});
const endpoints = Number(values.endpoints);
const dir = values.dir ?? join(tmpdir(), "courier-scale", `e${endpoints}`);
const started = performance.now();
const written = writeFixture({
  dir,
  repo: ROOT,
  endpoints,
  records: Number(values.records),
  portBase: Number(values.ports),
});
console.log(
  JSON.stringify({ dir, ...written, ms: Math.round(performance.now() - started) }, null, 2),
);
