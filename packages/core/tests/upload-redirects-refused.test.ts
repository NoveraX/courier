/**
 * An upload from a server where the fetch that sends it keeps a copy of a
 * stream for a redirect it may follow — Node 22's and 24's own, or a
 * source's own under any Node. A form's body, which can be read again,
 * follows its redirects, read again for each hop. A stream read once is
 * told to follow none, so it keeps no copy, and a redirect fails the upload
 * as a network error does. A redirect the call refuses itself fails it
 * once, whatever its retry policy: the upstream would answer it the same.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { NetworkError } from "../src/errors";
import { retryMiddleware } from "../src/middleware/index";
import { coreFetch } from "../src/utils/fetch";
import { streamedUpload } from "../src/utils/streamed-upload";
import { startUpstream, type Upstream } from "./helpers/upstream";

/* The runtime's fetch copying this, and each fetch a test sends with taken for it. */
vi.mock("../src/utils/fetch-copies", () => {
  const copies = { forms: true, streams: true };
  return { FETCH_COPIES: copies, copiesOf: () => copies };
});

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

const bytes = (): Uint8Array<ArrayBuffer> => new Uint8Array(4000).fill(5);

const form = (): FormData => {
  const body = new FormData();
  body.append("file", new File([bytes()], "a.bin"));
  return body;
};

/* A fetch that records how each request was handed to it, and reads its body. */
function recording(): {
  sent: RequestInit[];
  send: (url: string, init: RequestInit) => Promise<Response>;
} {
  const sent: RequestInit[] = [];
  const send = async (_url: string, init: RequestInit): Promise<Response> => {
    sent.push(init);
    if (init.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
    return new Response("{}");
  };
  return { sent, send };
}

describe("an upload where fetch would copy the stream", () => {
  it("follows a 307 with a form's body, read again from where it is", async () => {
    upstream = await startUpstream((request, res) => {
      res.writeHead(request.url === "/start" ? 307 : 200, { location: "/elsewhere" });
      res.end();
    });

    const { response } = await coreFetch("POST", `${upstream.url}/start`, { body: form() });

    expect(response.status).toBe(200);
    const [first, second] = upstream.received;
    expect(upstream.received.map((request) => request.url)).toEqual(["/start", "/elsewhere"]);
    expect(first?.body.includes(Buffer.from(bytes()))).toBe(true);
    expect(second?.body).toEqual(first?.body);
  });

  it("sends a stream told to follow no redirect, which a 307 fails as a network error does", async () => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(307, { location: "/elsewhere" });
      res.end();
    });

    const call = coreFetch("POST", `${upstream.url}/start`, { body: new Blob([bytes()]).stream() });

    await expect(call).rejects.toBeInstanceOf(NetworkError);
    expect(upstream.received.map((request) => request.url)).toEqual(["/start"]);
  });

  it("sends a stream, and a streamed upload, told to follow no redirect, whatever its origin rules", async () => {
    const { sent, send } = recording();

    await coreFetch("POST", "http://127.0.0.1:9/raw", {
      body: new Blob([bytes()]).stream(),
      withinOrigin: true,
      fetch: send,
    });
    await coreFetch("POST", "http://127.0.0.1:9/upload", {
      body: streamedUpload("multipart/form-data; boundary=x", {
        pull(controller) {
          controller.enqueue(bytes());
          controller.close();
        },
      }),
      withinOrigin: true,
      fetch: send,
    });

    expect(sent.map((init) => init.redirect)).toEqual(["error", "error"]);
  });

  it("keeps the redirect mode a caller set itself", async () => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(307, { location: "/elsewhere" });
      res.end();
    });

    const { response } = await coreFetch("POST", `${upstream.url}/start`, {
      body: form(),
      redirect: "manual",
    });

    expect(response.status).toBe(307);
  });
});

/* A call that refuses every redirect, under a policy that repeats a write, as `mutations: true`
   asks: the upstream tells a repeated one apart. */
function uploader(baseURL: string): (variables: unknown) => Promise<unknown> {
  const { endpoint } = courier();
  const client = createCaller(
    defineApi({
      name: "api",
      baseURL,
      middleware: [retryMiddleware({ limit: 2, delay: 1, mutations: true })],
      endpoints: { upload: endpoint.post("start").variables<FormData | Record<string, unknown>>() },
    }),
  ) as unknown as {
    upload: { with(options: RequestInit): (variables: unknown) => Promise<unknown> };
  };
  return client.upload.with({ redirect: "error" });
}

describe("an upload whose call refuses redirects, under a policy that repeats it", () => {
  it.each([
    ["a form", form],
    ["a record that holds a file", () => ({ title: "Q3", file: new File(["x"], "a.bin") })],
  ])("is sent once a redirect fails it, %s", async (_, variables) => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(307, { location: "/elsewhere" });
      res.end();
    });

    const failure = await uploader(upstream.url)(variables()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NetworkError);
    expect(upstream.received.map((request) => request.url)).toEqual(["/start"]);
  });

  it("is sent again when its connection dropped instead", async () => {
    upstream = await startUpstream((_request, res) => {
      if (upstream?.received.length === 1) {
        res.socket?.destroy();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });

    await uploader(upstream.url)(form());

    expect(upstream.received).toHaveLength(2);
  });
});
