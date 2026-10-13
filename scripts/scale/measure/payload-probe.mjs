/**
 * Run inside a fresh Node: call an endpoint whose answer is a large list —
 * thousands of records, megabytes of JSON, read through its schema — first
 * with nothing attached, then attached to a Studio that counts what it is
 * sent. Prints, for each size, how long a call took both ways and how much
 * of it reached Studio, as JSON.
 */
import { createServer } from "node:http";

import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { attachRuntime } from "@noverax/courier-studio-core/runtime";
import { Server } from "socket.io";
import { z } from "zod";

import { percentiles } from "./metrics.mjs";
import { sampleRecord } from "./sample-record.mjs";

const SIZES = [1_000, 10_000, 50_000];
/* Calls per size, the first two left out of the median: more of the small
   ones, whose few milliseconds a busy moment of the machine would sway. */
const CALLS = { 1000: 40, 10000: 16, 50000: 8 };
const FIELDS = ["owner", "tags", "amount", "address", "priority", "description"];

const bodies = new Map(
  SIZES.map((count) => [
    count,
    JSON.stringify(Array.from({ length: count }, (_, at) => sampleRecord(FIELDS, `id-${at}`))),
  ]),
);
const upstream = createServer((req, res) => {
  const count = Number(new URL(req.url ?? "/", "http://x").searchParams.get("count"));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(bodies.get(count) ?? "[]");
});
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));

const received = { messages: 0, bytes: 0 };
const studio = createServer();
const io = new Server(studio, { maxHttpBufferSize: 64 * 2 ** 20 });
io.of("/runtime").on("connection", (socket) => {
  socket.on(
    "runtime:hello",
    (_hello, welcome) =>
      typeof welcome === "function" && welcome({ maxMessageBytes: 64 * 2 ** 20 }),
  );
  socket.on("events", (batch) => {
    received.messages += 1;
    received.bytes += batch.length;
  });
});
await new Promise((resolve) => studio.listen(0, "127.0.0.1", resolve));

const { endpoint } = courier();
const Record = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "pending", "archived", "suspended"]),
  owner: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  tags: z.array(z.string()),
  amount: z.object({ currency: z.string(), value: z.number() }),
  address: z.object({ line1: z.string(), city: z.string(), country: z.string() }),
  priority: z.number(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const baseURL = `http://127.0.0.1:${upstream.address().port}`;
const api = defineApi({
  baseURL,
  groups: {
    bulk: defineGroup({
      prefix: "bulk",
      endpoints: {
        list: endpoint
          .get("")
          .variables(z.object({ count: z.number() }))
          .response(z.array(Record)),
      },
    }),
  },
});
const caller = createCaller(api);
/* The same answer fetched, parsed and checked by the same schema with nothing
   of Courier in between: the floor a call is held to on this machine. */
const Records = z.array(Record);

async function bare(count) {
  const samples = [];
  for (let call = 0; call < CALLS[count]; call++) {
    const begun = performance.now();
    const response = await fetch(`${baseURL}/bulk?count=${count}`);
    Records.parse(await response.json());
    samples.push(performance.now() - begun);
  }
  return percentiles(samples.slice(2)).p50;
}

async function timed(count) {
  const samples = [];
  for (let call = 0; call < CALLS[count]; call++) {
    const begun = performance.now();
    await caller.bulk.list({ count });
    samples.push(performance.now() - begun);
  }
  return percentiles(samples.slice(2)).p50;
}

const floor = {};
const plain = {};
for (const count of SIZES) {
  floor[count] = await bare(count);
  plain[count] = await timed(count);
}
process.env.COURIER_STUDIO_URL = `http://127.0.0.1:${studio.address().port}`;
const runtime = await attachRuntime("payloads");
await new Promise((resolve) => setTimeout(resolve, 500));
const attached = {};
for (const count of SIZES) {
  const before = { ...received };
  attached[count] = await timed(count);
  await new Promise((resolve) => setTimeout(resolve, 200));
  attached[`${count}:eventBytes`] = (received.bytes - before.bytes) / CALLS[count];
}
runtime.detach();
io.close();
upstream.close();
console.log(
  JSON.stringify({
    sizes: Object.fromEntries(SIZES.map((count) => [count, (bodies.get(count) ?? "").length])),
    floor,
    plain,
    attached,
  }),
);
process.exit(0);
