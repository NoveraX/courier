/**
 * A form or a Blob a server sends: handed to Node's fetch as the stream of
 * its bytes, which fetch keeps no copy of, rather than as itself, which
 * fetch copied whole for as long as it sent it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { coreFetch } from "../src/utils/fetch";
import { type StreamedUploadSource, streamedUpload } from "../src/utils/streamed-upload";
import { startUpstream, type Upstream } from "./helpers/upstream";

/* Redirects followed as a fetch that keeps no copy of a stream, Node 26's, follows them;
   where one would, an upload follows none (upload-redirects-refused.test.ts). */
vi.mock("../src/utils/fetch-copies", () => ({ FETCH_COPIES: { forms: true, streams: false } }));

const { endpoint } = courier();
let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

/** A fetch that records what it was handed and answers 200. */
function recordingFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const send = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (init.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
    return new Response("{}", { headers: { "content-type": "application/json" } });
  };
  return { calls, send };
}

describe("a form a server sends", () => {
  it("goes to fetch as the stream of its bytes, with its length and its boundary", async () => {
    const { calls, send } = recordingFetch();
    const form = new FormData();
    form.append("note", "hi");
    form.append("file", new File([new Uint8Array(1000).fill(1)], "a.bin"));

    await coreFetch("POST", "http://127.0.0.1:9/upload", { body: form, fetch: send });

    const { init } = calls[0] ?? { init: {} as RequestInit };
    const headers = new Headers(init.headers);
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(init).toMatchObject({ duplex: "half" });
    expect(headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=----courier-/);
    expect(Number(headers.get("content-length"))).toBeGreaterThan(1000);
  });

  it("reaches the upstream whole, as the form it was", async () => {
    upstream = await startUpstream(async (request, res) => {
      const form = await new Response(new Uint8Array(request.body), {
        headers: { "content-type": request.headers["content-type"] ?? "" },
      }).formData();
      const file = form.get("file") as File;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          note: form.get("note"),
          size: file.size,
          length: request.headers["content-length"],
        }),
      );
    });
    const api = defineApi({
      name: "files",
      baseURL: upstream.url,
      endpoints: { upload: endpoint.post("upload").variables<FormData>() },
    });
    const form = new FormData();
    form.append("note", "hi");
    form.append("file", new File([new Uint8Array(70_000).fill(9)], "a.bin"));

    const answer = await createCaller(api).upload(form);

    expect(answer).toEqual({
      note: "hi",
      size: 70_000,
      length: String(upstream.received[0]?.body.byteLength),
    });
  });

  it("follows a 307 with its body, as fetch did", async () => {
    upstream = await startUpstream((request, res) => {
      if (request.url === "/start") {
        res.writeHead(307, { location: "/upload" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: request.url, bytes: request.body.byteLength }));
    });
    const form = new FormData();
    form.append("file", new File([new Uint8Array(5000).fill(3)], "a.bin"));

    const response = await coreFetch("POST", `${upstream.url}/start`, { body: form });

    expect(await response.json()).toEqual({
      url: "/upload",
      bytes: upstream.received[0]?.body.byteLength,
    });
    expect(upstream.received[1]?.body.equals(upstream.received[0]?.body ?? Buffer.alloc(0))).toBe(
      true,
    );
  });
});

describe("a Blob a server sends", () => {
  it("goes as a stream with its own type, or the one the caller names", async () => {
    const { calls, send } = recordingFetch();
    const blob = new Blob(["png bytes"], { type: "image/png" });

    await coreFetch("PUT", "http://127.0.0.1:9/raw", { body: blob, fetch: send });
    await coreFetch("PUT", "http://127.0.0.1:9/raw", {
      body: blob,
      headers: { "content-type": "application/octet-stream" },
      fetch: send,
    });

    const [own, named] = calls.map(({ init }) => new Headers(init.headers));
    expect(calls[0]?.init.body).toBeInstanceOf(ReadableStream);
    expect([own?.get("content-type"), own?.get("content-length")]).toEqual(["image/png", "9"]);
    expect(named?.get("content-type")).toBe("application/octet-stream");
  });
});

describe("a stream a server sends", () => {
  const closing = (text: string): StreamedUploadSource => ({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

  it("goes as a streamed upload with the type that names its boundary, whatever the caller named", async () => {
    const { calls, send } = recordingFetch();
    const upload = streamedUpload(
      "multipart/form-data; boundary=----courier-x",
      closing("--x--\r\n"),
    );

    await coreFetch("POST", "http://127.0.0.1:9/upload", {
      body: upload,
      headers: { "content-type": "application/json" },
      fetch: send,
    });

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("content-type")).toBe("multipart/form-data; boundary=----courier-x");
    expect(headers.has("content-length")).toBe(false);
    expect(calls[0]?.init).toMatchObject({ duplex: "half" });
  });

  it("goes to fetch as it is where fetch keeps no copy of a stream", async () => {
    const { calls, send } = recordingFetch();
    const stream = new ReadableStream(closing("raw"));

    await coreFetch("POST", "http://127.0.0.1:9/raw", { body: stream, fetch: send });

    expect(calls[0]?.init.body).toBe(stream);
    expect(calls[0]?.init.redirect).toBeUndefined();
  });
});
