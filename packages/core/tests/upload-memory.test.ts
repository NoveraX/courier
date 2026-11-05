/**
 * What an upload through the proxy costs the proxy's process — the budget
 * it is held to. The proxy runs alone in a process of its own; the client
 * that sends the upload, as a browser would, and the upstream that reads and
 * drops it run here, so that only what the proxy holds is measured.
 *
 * Read whole, then parsed by the platform, 100 MB took 700 MB to 1.1 GB of
 * buffers. Parsed as it arrives, written to disk past its share of memory
 * and sent on as a stream, it takes a few megabytes, whatever its size.
 */
import { type ChildProcess, fork } from "node:child_process";
import { createServer, request, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const MB = 1024 * 1024;
const SIZE = 100 * MB;
/* Node's own server holds a few megabytes of a body as it reads it; its RSS moves by tens. */
const BUDGET = { buffersMB: 16, rssMB: 128 };

let child: ChildProcess | undefined;
let upstream: Server | undefined;

afterEach(async () => {
  child?.kill();
  await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
});

function message<TMessage>(from: ChildProcess): Promise<TMessage> {
  return new Promise((resolve, reject) => {
    from.once("message", (value) => resolve(value as TMessage));
    from.once("exit", (code) => reject(new Error(`the proxy exited with ${code}`)));
  });
}

/** An upstream that counts the bytes it receives, and answers with the count. */
async function countingUpstream(): Promise<string> {
  upstream = createServer((req, res) => {
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
    });
    req.on("end", () => res.end(JSON.stringify({ bytes })));
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
}

/** Send an upload of `size` bytes, a chunk at a time and no faster than the proxy takes it. */
function send(port: number, size: number): Promise<{ status: number; text: string }> {
  const boundary = "----courier-memory";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="_options"\r\n\r\n{}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\nContent-Type: application/zip\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return new Promise((resolve, reject) => {
    const upload = request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/api/request?_s=api&_g=files&_m=upload",
        headers: {
          origin: `http://127.0.0.1:${port}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(head.length + size + tail.length),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    upload.on("error", reject);
    upload.write(head);
    let sent = 0;
    const more = (): void => {
      while (sent < size) {
        const piece = Buffer.alloc(Math.min(64 * 1024, size - sent), 0x41);
        sent += piece.length;
        if (!upload.write(piece)) return void upload.once("drain", more);
      }
      upload.end(tail);
    };
    more();
  });
}

describe("a 100 MB upload through the proxy", () => {
  it("holds the proxy's buffers under 16 MB and its RSS within bounds", {
    timeout: 120_000,
  }, async () => {
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    child = fork(join(__dirname, "fixtures/upload-memory.ts"), {
      execArgv: ["--expose-gc", "--import", tsx],
      env: {
        ...process.env,
        UPSTREAM_URL: await countingUpstream(),
        HANDLER: JSON.stringify({ maxUploadBytes: SIZE + MB }),
      },
    });
    const { port } = await message<{ port: number }>(child);

    const answer = await send(port, SIZE);
    child.send("report");
    const held = await message<{ peakBuffersMB: number; peakRssMB: number }>(child);

    expect(answer.status, answer.text).toBe(200);
    expect(JSON.parse(answer.text).bytes).toBeGreaterThan(SIZE);
    expect(held.peakBuffersMB).toBeLessThanOrEqual(BUDGET.buffersMB);
    expect(held.peakRssMB).toBeLessThanOrEqual(BUDGET.rssMB);
  });
});
