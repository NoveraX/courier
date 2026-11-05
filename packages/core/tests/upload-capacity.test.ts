/**
 * The uploads the proxy keeps share the room the process gives them all at
 * once, in memory and on disk. Past what they keep in memory together, a
 * file goes to disk; an upload left no room at all is refused with 503 and
 * `Retry-After`. A crowd of clients uploading at once meets that limit, one
 * upload its own; the room comes back as each call ends.
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter/create-handler";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { concat } from "./helpers/multipart-fixtures";

const { endpoint } = courier();
const B = "----courier-client";
const field = (name: string, value: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const fileHead = `--${B}\r\nContent-Disposition: form-data; name="file"; filename="a.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
const close = `--${B}--\r\n`;

let upstream: Server | undefined;
let directory: string;
/* The answers the upstream holds back, each sent once the test lets it go. */
const held: ServerResponse[] = [];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "courier-capacity-test-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(async () => {
  for (const res of held.splice(0)) res.end("{}");
  vi.restoreAllMocks();
  upstream?.closeAllConnections();
  await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
  upstream = undefined;
  rmSync(directory, { recursive: true, force: true });
});

/* A proxy in front of an upstream that holds every answer back once it has read the upload. */
async function holdingProxy(
  config: HandlerConfig,
): Promise<(request: Request) => Promise<Response>> {
  upstream = createServer((req, res) => {
    req.resume();
    req.on("end", () => held.push(res));
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  const api = defineApi({
    baseURL: `http://127.0.0.1:${port}`,
    groups: {
      files: defineGroup({
        prefix: "files",
        expose: true,
        endpoints: { upload: endpoint.post("upload") },
      }),
    },
  });
  return createHandler({ sources: { api }, uploadDirectory: directory, ...config }).handlePost;
}

function upload(fileBytes: number, text = ""): Request {
  const body = concat(
    field("_options", "{}"),
    ...(text === "" ? [] : [field("note", text)]),
    fileHead,
    "z".repeat(fileBytes),
    "\r\n",
    close,
  );
  return new Request("http://localhost/api/request?_s=api&_g=files&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": `multipart/form-data; boundary=${B}`,
      "content-length": String(body.length),
    },
    body,
  });
}

/* Send an upload, and wait until the upstream holds it or the proxy has answered it; the answer,
   which the upstream may still hold, comes in a box so that awaiting this waits for no more. */
async function sent(
  handlePost: (request: Request) => Promise<Response>,
  request: Request,
): Promise<{ answer: Promise<Response> }> {
  const before = held.length;
  let answered = false;
  const answer = handlePost(request).finally(() => {
    answered = true;
  });
  await vi.waitFor(() => expect(answered || held.length === before + 1).toBe(true));
  return { answer };
}

describe("the uploads the proxy keeps at once", () => {
  it("keep a file on disk once the room they share in memory is taken, refusing none", async () => {
    const handlePost = await holdingProxy({ totalUploadMemoryBytes: 1_000_000 });

    const answers = [
      (await sent(handlePost, upload(600_000))).answer,
      (await sent(handlePost, upload(600_000))).answer,
      (await sent(handlePost, upload(600_000))).answer,
    ];

    /* The first in memory; the others, past the room left there, on disk. */
    expect(readdirSync(directory)).toHaveLength(2);
    for (const res of held.splice(0)) res.end("{}");
    expect((await Promise.all(answers)).map((answer) => answer.status)).toEqual([200, 200, 200]);
    await vi.waitFor(() => expect(readdirSync(directory)).toEqual([]));
  });

  it("refuse with 503 and Retry-After one there is no room for in memory, and take it once there is", async () => {
    const handlePost = await holdingProxy({
      uploadMode: "memory",
      totalUploadMemoryBytes: 1_000_000,
    });

    const first = (await sent(handlePost, upload(600_000))).answer;
    const refused = await (await sent(handlePost, upload(600_000))).answer;

    expect(refused.status).toBe(503);
    expect(refused.headers.get("retry-after")).toBe("5");
    expect(await refused.json()).toMatchObject({ code: "UPLOAD_CAPACITY_REACHED" });
    for (const res of held.splice(0)) res.end("{}");
    expect((await first).status).toBe(200);
    const again = (await sent(handlePost, upload(600_000))).answer;
    for (const res of held.splice(0)) res.end("{}");
    expect((await again).status).toBe(200);
  });

  it("refuse with 503 one there is no room for on disk", async () => {
    const handlePost = await holdingProxy({
      uploadMemoryBytes: 0,
      totalUploadDiskBytes: 1_000_000,
    });

    await sent(handlePost, upload(600_000));
    const refused = await (await sent(handlePost, upload(600_000))).answer;

    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ code: "UPLOAD_CAPACITY_REACHED" });
  });

  it("count their text fields, which have no disk to go to, against the room in memory", async () => {
    const handlePost = await holdingProxy({ totalUploadMemoryBytes: 1_000 });

    const refused = await (await sent(handlePost, upload(10, "x".repeat(2_000)))).answer;

    expect(refused.status).toBe(503);
  });
});
