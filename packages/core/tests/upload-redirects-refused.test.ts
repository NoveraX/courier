/**
 * An upload from a server where the platform's fetch keeps a copy of the
 * whole stream for a redirect it may follow — Node 22's and 24's: told to
 * follow none, it keeps none, and a redirect fails the upload, once, as the
 * upstream would answer it with the same redirect again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { NetworkError } from "../src/errors";
import { retryMiddleware } from "../src/middleware/index";
import { coreFetch } from "../src/utils/fetch";
import { streamedUpload } from "../src/utils/streamed-upload";
import { startUpstream, type Upstream } from "./helpers/upstream";

vi.mock("../src/utils/fetch-copies", () => ({ FETCH_COPIES: { forms: true, streams: true } }));

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

const form = (): FormData => {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(4000).fill(5)], "a.bin"));
  return body;
};

describe("an upload where fetch would copy the stream", () => {
  it("is sent with redirect error, and a 307 fails it as a network error does", async () => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(307, { location: "/elsewhere" });
      res.end();
    });

    await expect(coreFetch("POST", `${upstream.url}/start`, { body: form() })).rejects.toThrow();
    expect(upstream.received.map((request) => request.url)).toEqual(["/start"]);
  });

  it("is told to follow no redirect, whatever its origin rules", async () => {
    const sent: RequestInit[] = [];
    const send = async (_url: string, init: RequestInit): Promise<Response> => {
      sent.push(init);
      if (init.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
      return new Response("{}");
    };

    await coreFetch("POST", "http://127.0.0.1:9/upload", {
      body: form(),
      withinOrigin: true,
      fetch: send,
    });

    expect(sent.map((init) => init.redirect)).toEqual(["error"]);
  });

  it("sends a stream, and a streamed upload, told to follow no redirect too", async () => {
    const sent: RequestInit[] = [];
    const send = async (_url: string, init: RequestInit): Promise<Response> => {
      sent.push(init);
      if (init.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
      return new Response("{}");
    };
    const bytes = new Uint8Array(4000).fill(5);

    await coreFetch("POST", "http://127.0.0.1:9/raw", {
      body: new Blob([bytes]).stream(),
      fetch: send,
    });
    await coreFetch("POST", "http://127.0.0.1:9/upload", {
      body: streamedUpload("multipart/form-data; boundary=x", {
        pull(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      fetch: send,
    });

    expect(sent.map((init) => init.redirect)).toEqual(["error", "error"]);
  });

  it("keeps the redirect mode a caller set itself", async () => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(307, { location: "/elsewhere" });
      res.end();
    });

    const response = await coreFetch("POST", `${upstream.url}/start`, {
      body: form(),
      redirect: "manual",
    });

    expect(response.status).toBe(307);
  });
});

/* A caller whose policy repeats a write, as `mutations: true` asks: the upstream tells a repeated one apart. */
function uploader(baseURL: string): (variables: unknown) => Promise<unknown> {
  const { endpoint } = courier();
  const client = createCaller(
    defineApi({
      name: "api",
      baseURL,
      middleware: [retryMiddleware({ limit: 2, delay: 1, mutations: true })],
      endpoints: { upload: endpoint.post("start").variables<FormData | Record<string, unknown>>() },
    }),
  ) as unknown as { upload: (variables: unknown) => Promise<unknown> };
  return client.upload;
}

describe("an upload a redirect failed, under a policy that repeats it", () => {
  it.each([
    ["a form", form],
    ["a record that holds a file", () => ({ title: "Q3", file: new File(["x"], "a.bin") })],
  ])("is sent once, %s", async (_, variables) => {
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
