/**
 * Load on the mocks Studio runs for the enterprise project: reads of lists,
 * of records and searches, records created and changed, across every
 * group of every API — and what Studio, which records each of them, costs
 * while they come and holds once they have.
 */
import { enterpriseModel } from "../fixture/model.mjs";
import { bareLoad } from "./bare-load.mjs";
import { load } from "./load.mjs";
import { cpuSeconds, measured, residentMb, times, treeOf } from "./metrics.mjs";
import { sampleRecord } from "./sample-record.mjs";

/* What the mocks may cost, against the same requests answered by a bare
   Node server for each API on the same machine in the same run, so the
   budget holds on a laptop and on a CI runner alike. */
const MOST = { rps: 0.12, p50: 9, p99: 6, cpu: 12 };
/* The bare servers listen past the mocks' own ports. */
const BARE_PORTS = 10;

/**
 * Load the mocks while Studio runs, and measure both.
 *
 * @param {{ endpoints: number, ports: { mocks: number }, requests?: number, connections?: number }} fixture - The project, and how much load
 * @param {{ url: string, pid: number }} studio - The running Studio
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureMocksLoad({ endpoints: 1000, ports }, studio);
 * ```
 */
export async function measureMocksLoad(
  { endpoints, ports, requests = 20_000, connections = 32 },
  studio,
) {
  const model = enterpriseModel({ endpoints });
  const base = ports.mocks + BARE_PORTS;
  const bare = await bareLoad({ apis: model.sources.length, endpoints, base }, plan(model, base), {
    requests,
    connections,
  });
  const requestsOf = plan(model, ports.mocks);
  const tree = treeOf(studio.pid);
  const before = cpuSeconds(tree);
  const started = performance.now();
  const seen = await load((index) => requestsOf[index % requestsOf.length] ?? requestsOf[0], {
    requests,
    connections,
  });
  const seconds = (performance.now() - started) / 1000;
  const used = cpuSeconds(tree) - before;
  const busy = (used / seconds) * 100;
  const cpu = (used * 1000) / requests;
  const studioPid = [studio.pid];
  return [
    measured("mocks.rps", seen.rps, "req/s", bare.rps * MOST.rps, {
      more: true,
      note: `${requests} requests over ${connections} connections, all 5 mocks; ${times(seen.rps, bare.rps)} bare Node's ${Math.round(bare.rps)}`,
    }),
    measured("mocks.p50", seen.p50, "ms", bare.p50 * MOST.p50, {
      note: `${times(seen.p50, bare.p50)} bare Node's ${bare.p50.toFixed(2)} ms`,
    }),
    measured("mocks.p99", seen.p99, "ms", bare.p99 * MOST.p99, {
      note: `${times(seen.p99, bare.p99)} bare Node's ${bare.p99.toFixed(2)} ms; max ${Math.round(seen.max)} ms`,
    }),
    measured("mocks.cpu", cpu, "ms/req", bare.cpu * MOST.cpu, {
      note: `processor time a request, Studio's recording of it included; ${times(cpu, bare.cpu)} bare Node's ${bare.cpu.toFixed(3)} ms`,
    }),
    measured("mocks.failed", seen.failed, "req", 0, { note: JSON.stringify(seen.statuses) }),
    measured("studio.loadCpu", busy, "%", 400, {
      note: "Studio and its mocks while the load ran, of one core",
    }),
    measured("studio.memoryAfterLoad", residentMb(tree), "MB", 2_500, {
      note: "right after the load: V8 gives the rest back within seconds",
    }),
    measured("studio.mainAfterLoad", residentMb(studioPid), "MB", 600, {
      note: `${requests} requests recorded`,
    }),
  ];
}

/* The requests of the load: per group, its list, a record, a search, a new record and a change, in turn. */
function plan(model, mockBase) {
  const requests = [];
  model.sources.forEach((source, at) => {
    const origin = `http://127.0.0.1:${mockBase + at}`;
    for (const group of source.groups) {
      const has = (name) => group.endpoints.some((each) => each.name === name);
      const input = sampleRecord(group.fields);
      delete input.id;
      delete input.createdAt;
      delete input.updatedAt;
      for (let id = 1; id <= 4; id++) {
        if (has("list"))
          requests.push({ origin, path: `/${group.name}?page=${id}&size=20`, method: "GET" });
        if (has("get"))
          requests.push({ origin, path: `/${group.name}/id-${id * 7}`, method: "GET" });
      }
      if (has("search"))
        requests.push({ origin, path: `/${group.name}/search?q=a`, method: "GET" });
      if (has("create"))
        requests.push({
          origin,
          path: `/${group.name}`,
          method: "POST",
          body: JSON.stringify(input),
        });
      if (has("update"))
        requests.push({
          origin,
          path: `/${group.name}/id-3`,
          method: "PATCH",
          body: JSON.stringify({ name: "Renamed" }),
        });
    }
  });
  return requests;
}
