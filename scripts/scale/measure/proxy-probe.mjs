/**
 * Run inside a fresh Node: call the enterprise project's endpoints the way
 * its pages do — through the app's own server — and the way its server code
 * does — straight to the backend — at a concurrency, timing every call.
 * Prints both, as JSON.
 */
import { argv } from "node:process";
import { pathToFileURL } from "node:url";

import { enterpriseModel, httpEndpoints } from "../fixture/model.mjs";
import { percentiles } from "./metrics.mjs";

const [
  storefrontBundle = "",
  callersBundle = "",
  endpoints = "1000",
  calls = "10000",
  concurrency = "32",
] = argv.slice(2);
const { storefront } = await import(pathToFileURL(storefrontBundle).href);
const { backend } = await import(pathToFileURL(callersBundle).href);
const VARIABLES = { list: { page: 1, size: 20 }, byId: { id: "id-7" }, search: { q: "a" } };
const targets = httpEndpoints(enterpriseModel({ endpoints: Number(endpoints) })).filter(
  (at) =>
    ["core", "catalog"].includes(at.source) && at.endpoint.shape in VARIABLES && !at.group.child,
);

async function run(caller) {
  const samples = [];
  let failed = 0;
  let issued = 0;
  const started = performance.now();
  const lane = async () => {
    while (issued < Number(calls)) {
      const at = targets[issued++ % targets.length];
      const begun = performance.now();
      try {
        await caller[at.source][at.path][at.endpoint.name](VARIABLES[at.endpoint.shape]);
      } catch {
        /* Counted, and the load goes on. */
        failed++;
      }
      samples.push(performance.now() - begun);
    }
  };
  await Promise.all(Array.from({ length: Number(concurrency) }, lane));
  return {
    rps: samples.length / ((performance.now() - started) / 1000),
    failed,
    ...percentiles(samples),
  };
}
await run(storefront);
const proxied = await run(storefront);
const direct = await run(backend);
console.log(JSON.stringify({ targets: targets.length, proxied, direct }));
