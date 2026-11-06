/**
 * A form goes under the content type of its own encoding, whose boundary
 * says where each part ends. Here the runtime's fetch reads a form as it
 * sends it, as a browser's, Bun's, Deno's or an edge runtime's does, so the
 * form is handed to fetch as it is rather than streamed as under Node. A
 * `Content-Type` the source, the call, a middleware or the endpoint's
 * closure sets would name no boundary, and the upstream could read no part
 * of the form: it is left off, for a `FormData` and for a record that holds
 * a file alike.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import type { Middleware } from "../src/middleware/types";
import { readParts } from "./helpers/multipart-fixtures";

vi.mock("../src/utils/fetch-copies", () => ({ FETCH_COPIES: { forms: false, streams: false } }));

const { endpoint } = courier();
const JSON_TYPE = { "content-type": "application/json" };

let upstream: Server | undefined;
const got: Array<{ contentType: string; parts: string[] }> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  got.length = 0;
  const server = upstream;
  upstream = undefined;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

/* An upstream that keeps each request's content type and the parts its boundary marks out. */
async function upstreamURL(): Promise<string> {
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const contentType = req.headers["content-type"] ?? "";
      const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(contentType)?.[1];
      const read = boundary
        ? readParts(new Blob([Buffer.concat(chunks)]).stream(), boundary)
        : Promise.resolve([]);
      void read.then((parts) => {
        got.push({
          contentType,
          parts: parts.map(
            (part) => `${part.name}=${part.filename ?? new TextDecoder().decode(part.bytes)}`,
          ),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
    });
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
}

const stampsJson: Middleware = {
  name: "stamps-json",
  phase: "before",
  handler: (ctx) => {
    ctx.headers.set("content-type", "application/json");
  },
};

type Send = (variables: unknown) => Promise<unknown>;

/* The call, with `application/json` set where `by` says. */
async function callWithJsonTypeSet(by: string): Promise<Send> {
  const baseURL = await upstreamURL();
  const setCover =
    by === "the endpoint's closure"
      ? endpoint
          .variables<Record<string, unknown> | FormData>()
          .via((http, variables) => http.post("covers", variables, { headers: JSON_TYPE }))
      : endpoint.post("covers").variables<Record<string, unknown> | FormData>();
  const api = defineApi({
    name: "api",
    baseURL,
    ...(by === "the source" && { headers: JSON_TYPE }),
    ...(by === "a middleware" && { middleware: [stampsJson] }),
    groups: { books: defineGroup({ endpoints: { setCover } }) },
  });
  const books = (
    createCaller(api) as unknown as {
      books: { setCover: Send; with: (options: object) => { setCover: Send } };
    }
  ).books;
  return by === "the call" ? books.with({ headers: JSON_TYPE }).setCover : books.setCover;
}

const cover = () => new File(["png"], "cover.png", { type: "image/png" });

function asForm(): FormData {
  const form = new FormData();
  form.append("title", "Dune");
  form.append("cover", cover());
  return form;
}

describe("a form whose content type something else set", () => {
  it.each(["the source", "the call", "a middleware", "the endpoint's closure"])(
    "goes under its own boundary when %s sets application/json",
    async (by) => {
      const send = await callWithJsonTypeSet(by);

      await send({ title: "Dune", cover: cover() });
      await send(asForm());

      for (const request of got) {
        expect(request.contentType).toMatch(/^multipart\/form-data; boundary=/);
        expect(request.parts).toEqual(["title=Dune", "cover=cover.png"]);
      }
      expect(got).toHaveLength(2);
    },
  );

  it("keeps a content type that is set for a body other than a form", async () => {
    const send = await callWithJsonTypeSet("the source");

    await send({ title: "Dune" });

    expect(got[0]?.contentType).toBe("application/json");
  });
});

/** Just enough of XMLHttpRequest to send an upload, keeping the headers it is given. */
class RecordingXhr {
  static headers: string[] = [];
  static bodies: unknown[] = [];
  status = 0;
  statusText = "";
  response: ArrayBuffer | null = null;
  responseType = "";
  withCredentials = false;
  upload = { addEventListener: () => undefined };
  private listeners = new Map<string, () => void>();
  open() {}
  setRequestHeader(name: string) {
    RecordingXhr.headers.push(name.toLowerCase());
  }
  getAllResponseHeaders() {
    return "content-type: application/json\r\n";
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  abort() {}
  send(body: unknown) {
    RecordingXhr.bodies.push(body);
    this.status = 200;
    this.response = new TextEncoder().encode("{}").buffer;
    queueMicrotask(() => this.listeners.get("load")?.());
  }
}

describe("a form sent with its progress, over XMLHttpRequest", () => {
  it("leaves the content type to the browser, which writes the form's boundary", async () => {
    vi.stubGlobal("XMLHttpRequest", RecordingXhr);
    RecordingXhr.headers = [];
    RecordingXhr.bodies = [];
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      headers: { ...JSON_TYPE, "x-made-up": "kept" },
      groups: {
        books: defineGroup({
          endpoints: {
            setCover: endpoint.post("covers").variables<Record<string, unknown> | FormData>(),
          },
        }),
      },
    });
    const books = (
      createCaller(api) as unknown as {
        books: { with: (options: object) => { setCover: Send } };
      }
    ).books.with({ onUploadProgress: () => undefined });

    await books.setCover({ title: "Dune", cover: cover() });
    await books.setCover(asForm());

    expect(RecordingXhr.bodies.map((body) => body instanceof FormData)).toEqual([true, true]);
    expect(RecordingXhr.headers).toContain("x-made-up");
    expect(RecordingXhr.headers).not.toContain("content-type");
  });
});
