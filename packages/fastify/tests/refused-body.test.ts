/**
 * A proxy request refused before its body is read, sent the way a browser
 * sends it: the whole body first, the response read only afterwards.
 *
 * The refusal used to wait on the body nobody read until Fastify's
 * keep-alive timer closed the socket, 72 seconds by default, so every
 * over-limit upload from a browser took 73 seconds to fail.
 */
import { once } from "node:events";
import { type AddressInfo, connect } from "node:net";
import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { courierPlugin } from "../src/index";

const { endpoint } = courier();
const SIXTEEN_MB = 16 * 1_048_576;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function listening(): Promise<number> {
  registerSources({
    api: defineApi({
      name: "api",
      baseURL: "http://127.0.0.1:1",
      endpoints: { list: endpoint.get("items") },
    }),
  });
  app = Fastify();
  await app.register(courierPlugin, { prefix: "/api/request" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  return (app.server.address() as AddressInfo).port;
}

/** Write the whole body, then read the answer; resolve with its status line. */
async function sendLikeABrowser(port: number, contentType: string): Promise<string> {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  socket.pause();
  socket.write(
    `POST /api/request?_s=api&_m=list HTTP/1.1\r\nhost: 127.0.0.1:${port}\r\ncontent-type: ${contentType}\r\ncontent-length: ${SIXTEEN_MB}\r\n\r\n`,
  );
  const chunk = new Uint8Array(65_536).fill(0x20);
  for (let sent = 0; sent < SIXTEEN_MB; sent += chunk.length) {
    if (!socket.write(chunk)) await once(socket, "drain");
  }
  socket.resume();
  const [first] = (await once(socket, "data")) as [Buffer];
  socket.destroy();
  return first.toString("utf8").split("\r\n")[0] ?? "";
}

describe("a refusal reaches a browser still uploading", () => {
  it.each([
    ["an envelope over the limit", "application/json", "413"],
    ["an unsupported content type", "text/plain", "415"],
  ])(
    "for %s",
    async (_, contentType, status) => {
      const port = await listening();
      const started = performance.now();

      const statusLine = await sendLikeABrowser(port, contentType);

      expect(statusLine).toContain(status);
      expect(performance.now() - started).toBeLessThan(3000);
    },
    10_000,
  );
});
