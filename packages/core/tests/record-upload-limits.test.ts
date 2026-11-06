/**
 * A record upload — a record of variables that holds a file, sent through the
 * proxy as `multipart/vnd.courier.variables` — is held to what every upload
 * is: its size to `maxUploadBytes`, its text to `maxBodyBytes`, its parts to
 * `maxUploadParts` as the form it goes as counts them, what it keeps to the
 * room every upload shares, refused 413 or 503 with the codes a form gets.
 * Sent on as it arrives, it is read no faster than the upstream takes it. A
 * multipart body of a type the proxy does not take is refused 415.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter/create-handler";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { RECORD_UPLOAD_TYPE } from "../src/utils/record-upload";
import { chunked, concat } from "./helpers/multipart-fixtures";

const { endpoint } = courier();
const B = "----courier-record";
const field = (name: string, value: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const fileHead = `--${B}\r\nContent-Disposition: form-data; name="file"; filename="a.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
const close = `--${B}--\r\n`;

let upstream: Server | undefined;
let directory: string;
/* The answers the upstream holds back, each sent once the test lets it go. */
const held: ServerResponse[] = [];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "courier-record-limits-"));
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

/* A proxy in front of an upstream that `answer` serves. */
async function proxyTo(
  answer: (req: IncomingMessage, res: ServerResponse) => void,
  config: HandlerConfig,
): Promise<(request: Request) => Promise<Response>> {
  upstream = createServer(answer);
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  const api = defineApi({
    baseURL: `http://127.0.0.1:${port}`,
    groups: {
      files: defineGroup({
        prefix: "files",
        expose: true,
        endpoints: { upload: endpoint.post("upload").variables<Record<string, unknown>>() },
      }),
    },
  });
  return createHandler({ sources: { api }, uploadDirectory: directory, ...config }).handlePost;
}

/* An upstream that holds every answer back once it has read the upload. */
const holding = (req: IncomingMessage, res: ServerResponse) => {
  req.resume();
  req.on("end", () => held.push(res));
};

/** A record upload of a file of `fileBytes`, its record's text `text` long. */
function recordBody(fileBytes: number, text = "hi"): Uint8Array<ArrayBuffer> {
  return concat(
    field("_options", "{}"),
    field(
      "_variables",
      JSON.stringify({ variables: { note: text, file: null }, files: [["file"]] }),
    ),
    fileHead,
    "z".repeat(fileBytes),
    "\r\n",
    close,
  );
}

/** A record upload of a file and a list of `items` empty strings, each a part of the form it goes as. */
function listBody(items: number): Uint8Array<ArrayBuffer> {
  const record = { variables: { cover: null, tags: Array(items).fill("") }, files: [["cover"]] };
  return concat(
    field("_options", "{}"),
    field("_variables", JSON.stringify(record)),
    fileHead.replace('name="file"', 'name="cover"'),
    "png",
    "\r\n",
    close,
  );
}

function request(body: BodyInit, type = `${RECORD_UPLOAD_TYPE}; boundary=${B}`, length?: number) {
  return new Request("http://localhost/api/request?_s=api&_g=files&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": type,
      ...(length !== undefined && { "content-length": String(length) }),
    },
    body,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
}

/* Send an upload, and wait until the upstream holds it or the proxy has answered it. */
async function sent(
  handlePost: (request: Request) => Promise<Response>,
  made: Request,
): Promise<{ answer: Promise<Response> }> {
  const before = held.length;
  let answered = false;
  const answer = handlePost(made).finally(() => {
    answered = true;
  });
  await vi.waitFor(() => expect(answered || held.length === before + 1).toBe(true));
  return { answer };
}

describe("a record upload", () => {
  it.each([
    ["kept", {}],
    ["sent on as it arrives", { uploadMode: "stream" } as const],
  ])("past maxUploadBytes is refused 413, %s", async (_, config) => {
    const handlePost = await proxyTo(holding, { maxUploadBytes: 10_000, ...config });
    const body = recordBody(20_000);

    const answer = await handlePost(request(body, undefined, body.length));

    expect(answer.status).toBe(413);
    expect(await answer.json()).toMatchObject({ success: false, code: "BODY_TOO_LARGE" });
  });

  it.each([
    ["kept", {}],
    ["sent on as it arrives", { uploadMode: "stream" } as const],
  ])("holds its record to maxUploadParts as the form it goes as, %s", async (_, config) => {
    let calls = 0;
    const handlePost = await proxyTo((req, res) => {
      calls += 1;
      req.resume();
      req.on("end", () => res.end("{}"));
    }, config);

    /* Its options, its file and 998 items: 1000 parts, the most an upload may hold. */
    const taken = await handlePost(request(listBody(998)));
    const refused = await handlePost(request(listBody(999)));

    expect(taken.status).toBe(200);
    expect(refused.status).toBe(413);
    expect(await refused.json()).toMatchObject({
      code: "UPLOAD_TOO_MANY_PARTS",
      message: "An upload holds more than 1000 parts",
    });
    expect(calls).toBe(1);
  });

  it("whose record's text passes maxBodyBytes is refused 413, the code a form's text gets", async () => {
    const handlePost = await proxyTo(holding, { maxBodyBytes: 1_000 });
    const body = recordBody(10, "x".repeat(2_000));

    const answer = await handlePost(request(body, undefined, body.length));

    expect(answer.status).toBe(413);
    expect(await answer.json()).toMatchObject({ code: "UPLOAD_FIELDS_TOO_LARGE" });
  });

  it("finding no room left among the uploads kept at once is refused 503, and taken once there is", async () => {
    const handlePost = await proxyTo(holding, {
      uploadMode: "memory",
      totalUploadMemoryBytes: 1_000_000,
    });
    const body = () => recordBody(600_000);

    const first = (await sent(handlePost, request(body()))).answer;
    const refused = await (await sent(handlePost, request(body()))).answer;

    expect(refused.status).toBe(503);
    expect(refused.headers.get("retry-after")).toBe("5");
    expect(await refused.json()).toMatchObject({ code: "UPLOAD_CAPACITY_REACHED" });
    for (const res of held.splice(0)) res.end("{}");
    expect((await first).status).toBe(200);
    const again = (await sent(handlePost, request(body()))).answer;
    for (const res of held.splice(0)) res.end("{}");
    expect((await again).status).toBe(200);
  });

  it.each([
    ["kept", {}],
    ["sent on as it arrives", { uploadMode: "stream" } as const],
  ])(
    "counts its record's text, which has no disk to go to, against the room in memory, %s",
    async (_, config) => {
      const handlePost = await proxyTo(holding, { totalUploadMemoryBytes: 1_000, ...config });

      const refused = await (await sent(handlePost, request(recordBody(10, "x".repeat(2_000)))))
        .answer;

      expect(refused.status).toBe(503);
      expect(await refused.json()).toMatchObject({ code: "UPLOAD_CAPACITY_REACHED" });
    },
  );

  it("sent on as it arrives holds its record's text in that room until its call has its answer", async () => {
    const handlePost = await proxyTo(holding, {
      uploadMode: "stream",
      totalUploadMemoryBytes: 3_000,
    });
    const body = () => recordBody(10, "x".repeat(2_000));

    const first = (await sent(handlePost, request(body()))).answer;
    const refused = await (await sent(handlePost, request(body()))).answer;
    for (const res of held.splice(0)) res.end("{}");

    expect(refused.status).toBe(503);
    expect((await first).status).toBe(200);
    const again = (await sent(handlePost, request(body()))).answer;
    for (const res of held.splice(0)) res.end("{}");
    expect((await again).status).toBe(200);
  });

  it("sent on as it arrives is read no faster than the upstream takes it, none of it kept", async () => {
    const body = recordBody(16_000_000);
    const cuts = Array.from({ length: Math.ceil(body.length / 16_384) }, (_, at) => at * 16_384);
    const { stream, pulls } = chunked(body, cuts);
    let received = 0;
    let lead = 0;
    const handlePost = await proxyTo(
      (req, res) => {
        req.on("data", (chunk: Buffer) => {
          received += chunk.length;
          lead = Math.max(lead, pulls() * 16_384 - received);
        });
        req.on("end", () => res.end("{}"));
      },
      { uploadMode: "stream", maxUploadBytes: 32_000_000 },
    );

    const answer = await handlePost(request(stream, undefined, body.length));

    expect(answer.status).toBe(200);
    expect(received).toBeGreaterThan(16_000_000);
    /* The parser and the sockets on the way hold some of it, more of it on a loaded machine;
       kept, the upload would be read whole before the upstream got a byte of it. */
    expect(lead).toBeLessThan(body.length / 2);
  });
});

describe("a multipart body of a type the proxy does not take", () => {
  it("is refused 415, as any other type it does not take is", async () => {
    const handlePost = await proxyTo(holding, {});
    const body = recordBody(10);

    const answer = await handlePost(request(body, `multipart/mixed; boundary=${B}`, body.length));

    expect(answer.status).toBe(415);
    expect(await answer.json()).toMatchObject({
      success: false,
      message: "Unsupported Content-Type",
    });
    expect(held).toHaveLength(0);
  });
});
