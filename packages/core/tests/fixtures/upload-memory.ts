/**
 * The proxy alone, in a process of its own, on Node's own server, its
 * upstream at UPSTREAM_URL in another: it tells its parent its port, serves
 * the uploads it is sent, and on "report" says the most it held, then exits.
 *
 * What it held is sampled every 20 ms after two full collections, each
 * followed by a turn of the event loop. V8 frees the buffers a collection
 * finds unreached on a thread of its own, and Node lets go of the buffer a
 * finished write held only once the request that wrote it is collected in
 * turn: read at once, a sample still counted them, by as much as a hundred
 * megabytes on a server that holds nothing.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setImmediate as turn } from "node:timers/promises";

import { createHandler } from "../../src/adapter/create-handler";
import type { HandlerConfig } from "../../src/adapter/handler-config";
import { courier, defineApi, defineGroup } from "../../src/define/index";
import { sendWebResponse, toWebRequest } from "../../src/node";
import { registerSources } from "../../src/sources";

const MB = 1024 * 1024;
const collect = (globalThis as { gc?: () => void }).gc;
if (collect === undefined || process.send === undefined) {
  throw new Error("fork this with --expose-gc");
}

const { endpoint } = courier();
const files = defineGroup({
  prefix: "files",
  expose: true,
  endpoints: { upload: endpoint.post("upload") },
});
registerSources({ api: defineApi({ baseURL: process.env.UPSTREAM_URL ?? "", groups: { files } }) });
const options: HandlerConfig = JSON.parse(process.env.HANDLER ?? "{}");
const { handlePost } = createHandler(options);
const proxy = createServer(async (req, res) => {
  await sendWebResponse(await handlePost(toWebRequest(req, res)), res);
});
await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));

collect();
collect();
await turn();
const before = process.memoryUsage();
let peakBuffers = 0;
let peakRss = 0;
let sampling = false;
setInterval(async () => {
  if (sampling) return;
  sampling = true;
  collect();
  await turn();
  collect();
  await turn();
  const now = process.memoryUsage();
  peakBuffers = Math.max(
    peakBuffers,
    now.arrayBuffers + now.external - before.arrayBuffers - before.external,
  );
  peakRss = Math.max(peakRss, now.rss - before.rss);
  sampling = false;
}, 20).unref();

process.send({ port: (proxy.address() as AddressInfo).port });
process.once("message", () => {
  process.send?.({ peakBuffersMB: peakBuffers / MB, peakRssMB: peakRss / MB }, () => {
    proxy.close();
    process.disconnect?.();
  });
});
