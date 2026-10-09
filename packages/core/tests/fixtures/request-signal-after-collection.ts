/*
 * Run with --expose-gc. Each request is let go of at once and only its
 * signal kept, as a streamed answer keeps it; collections run before the
 * clients leave, and the output says how many signals heard them go.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { toWebRequest } from "../../src/node";

const collect = (globalThis as { gc?: () => void }).gc;
if (!collect) throw new Error("This script needs --expose-gc");

const kept: AbortSignal[] = [];
let heard = 0;
const server = createServer((req, res) => {
  const signal = toWebRequest(req, res).signal;
  signal.addEventListener("abort", () => {
    heard++;
  });
  kept.push(signal);
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.write(": open\n\n");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const clients = Array.from({ length: 10 }, () => new AbortController());
await Promise.all(
  clients.map(async (client) =>
    (await fetch(url, { signal: client.signal })).body?.getReader().read(),
  ),
);
for (let round = 0; round < 3; round++) {
  collect();
  await new Promise((resolve) => setTimeout(resolve, 20));
}
for (const client of clients) client.abort();
await new Promise((resolve) => setTimeout(resolve, 500));

process.stdout.write(JSON.stringify({ heard, clients: clients.length, kept: kept.length }));
server.closeAllConnections();
server.close();
