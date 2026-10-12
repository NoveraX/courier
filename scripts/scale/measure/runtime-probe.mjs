/**
 * Run inside a fresh Node with `--expose-gc`: import the project's callers —
 * every API defined — and call its endpoints with the network left out, to
 * see what Courier itself costs. Prints what it saw, as JSON.
 */
import { argv } from "node:process";
import { pathToFileURL } from "node:url";

import { enterpriseModel } from "../fixture/model.mjs";
import { percentiles } from "./metrics.mjs";
import { sampleRecord } from "./sample-record.mjs";

const [bundle = "", endpoints = "1000", calls = "20000"] = argv.slice(2);
const model = enterpriseModel({ endpoints: Number(endpoints) });
const records = new Map();
const targets = [];
for (const source of model.sources) {
  for (const group of source.groups) {
    if (!group.endpoints.some((each) => each.name === "get")) continue;
    records.set(`/${group.name}/id_1`, JSON.stringify(sampleRecord(group.fields)));
    targets.push([source.name, group.name]);
  }
}
const headers = { "content-type": "application/json" };
/* The backend, without a network: each record as its server would send it. */
globalThis.fetch = async (url) => {
  const body = records.get(new URL(String(url)).pathname);
  return new Response(body ?? "{}", { status: body ? 200 : 404, headers });
};
const gc = /** @type {() => void} */ (globalThis.gc);
gc();
const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
const { backend } = await import(pathToFileURL(bundle).href);
const importMs = performance.now() - started;
gc();
const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1_048_576;

async function timed(count, call) {
  const samples = [];
  for (let index = 0; index < count; index++) {
    const [source, group] = targets[index % targets.length];
    const begun = performance.now();
    await call(source, group);
    samples.push((performance.now() - begun) * 1000);
  }
  return samples;
}
const first = performance.now();
await backend[targets[0][0]][targets[0][1]].get({ id: "id_1" });
const firstCallMs = performance.now() - first;
const viaCourier = (source, group) => backend[source][group].get({ id: "id_1" });
const floor = async (_, group) => (await fetch(`http://127.0.0.1/${group}/id_1`)).json();
await timed(2000, viaCourier);
await timed(2000, floor);
const courier = percentiles(await timed(Number(calls), viaCourier));
const bare = percentiles(await timed(Number(calls), floor));
console.log(
  JSON.stringify({ importMs, heapMb, firstCallMs, targets: targets.length, courier, bare }),
);
