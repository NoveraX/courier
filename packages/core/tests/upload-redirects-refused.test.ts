/**
 * An upload from a server where the platform's fetch keeps a copy of the
 * whole stream for a redirect it may follow — Node 22's and 24's: told to
 * follow none, it keeps none, and a redirect fails the upload.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { coreFetch } from "../src/utils/fetch";
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
