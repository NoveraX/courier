/**
 * Answers in a React Native app, read through its own classes: React
 * Native's fetch — the whatwg-fetch polyfill over its XMLHttpRequest — or
 * Expo's, whose answer carries its body as a stream while `Response` stays
 * the polyfill's, which cannot carry one. Whatever the call does — it can be
 * cancelled, its source parses its answer, it shares an identical request in
 * flight, it counts its download, it sends a body, a stream's bytes and all,
 * through the app's fetch or through XMLHttpRequest for its upload's
 * progress — it resolves to what the API sent, its text decoded as UTF-8;
 * cancelled while a stream it uploads is read, it stops reading it. A call
 * that reads its answer as it comes is handed it so by Expo's fetch, and is
 * refused where React Native's fetch, which hands an answer over only once
 * all of it has arrived, would send it.
 */
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import type { SourceFetch } from "../src/http-client/source-transport";
import type { DownloadProgress, ResponseParser } from "../src/http-client/types";
import { createProxyCaller } from "../src/proxy-caller";
import { isCancellation } from "../src/utils/abort";
import { endlessBody, within } from "./helpers/endless-body";
import { type AppFetch, asReactNative, bytesOf, NativeBlob } from "./helpers/react-native";
import { type ReceivedRequest, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const GREETING = { text: "Hello, café — naïve ✓ 👋" };
const FILE = new Uint8Array(96 * 1024).map((_, index) => index % 251);
const ALL: AppFetch[] = ["react-native", "expo", "expo-with-react-native-fetch"];
let upstream: Upstream;
/* Resolved once the slow answer's first part is out, its rest held back until `release`. */
let started: Promise<void>;
let release: () => void;

beforeEach(async () => {
  let start: () => void = () => undefined;
  started = new Promise((resolve) => {
    start = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  upstream = await startUpstream((request, res) => answer(request, res, start, held));
});

afterEach(async () => {
  release();
  await upstream.close();
});

function answer(
  request: ReceivedRequest,
  res: ServerResponse,
  start: () => void,
  held: Promise<void>,
): void {
  const body = Buffer.from(JSON.stringify(GREETING));
  /* A read through the proxy carries its call in the query. */
  switch (request.url.split("?")[0]) {
    case "/greeting":
      res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
      res.end(body);
      return;
    case "/file":
      res.writeHead(200, { "content-type": "application/pdf", "content-length": FILE.length });
      res.end(FILE);
      return;
    case "/upload": {
      const echo = Buffer.from(JSON.stringify({ ...GREETING, received: request.body.toString() }));
      res.writeHead(200, { "content-type": "application/json", "content-length": echo.length });
      res.end(echo);
      return;
    }
    case "/proxy":
      /* What the app's server answers through its proxy: the API's answer, as it arrives. */
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    case "/slow-greeting":
      res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
      res.write(body.subarray(0, 8), () => start());
      void held.then(() => res.end(body.subarray(8)));
      return;
    default:
      res.writeHead(404).end();
  }
}

function api(
  options: { responseType?: "blob"; responseParser?: ResponseParser; fetch?: SourceFetch } = {},
) {
  return defineApi({
    baseURL: upstream.url,
    ...options,
    endpoints: {
      greeting: endpoint.get("greeting").response<typeof GREETING>(),
      slowGreeting: endpoint.get("slow-greeting").response<typeof GREETING>(),
      file: endpoint.get("file").response<unknown>(),
      upload: endpoint.post("upload").variables<unknown>().response<unknown>(),
    },
  });
}

/* The app's calls through its server's proxy. */
function proxied() {
  const source = defineApi({
    expose: true,
    name: "shop",
    baseURL: upstream.url,
    endpoints: { greeting: endpoint.get("greeting").response<typeof GREETING>() },
  });
  return createProxyCaller(routesOf(source, "shop"), {
    proxyPath: { http: `${upstream.url}/proxy` },
  });
}

/* What a call that cannot read its answer as it comes is refused with. */
const UNSTREAMED = {
  error: expect.objectContaining({
    name: "ConfigurationError",
    code: "RESPONSE_STREAM_UNAVAILABLE",
    message: expect.stringContaining("as it comes"),
  }),
};

/* An app's own fetch, one that signs each request and sends it with the app's. */
const signed: SourceFetch = (url, init) => {
  const headers = new Headers((init as RequestInit).headers);
  headers.set("x-signature", "signed");
  return globalThis.fetch(url, { ...init, headers });
};

const TWO_PARTS = "part one — café, part two ✓";

/* A body the app builds as it goes, in two parts. */
function twoParts(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("part one — café, "));
      controller.enqueue(encoder.encode("part two ✓"));
      controller.close();
    },
  });
}

/* Read by hand: the app's Response is the polyfill's, which cannot read a stream. */
async function textOf(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

async function outcome(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
}

describe.each(ALL)("a read that can be cancelled, in an app whose fetch is %s's", (fetch) => {
  it("resolves to the body the API sent", async () => {
    asReactNative(fetch);

    const read = createCaller(api()).greeting.with({ signal: new AbortController().signal })();

    expect(await outcome(read)).toEqual({ value: GREETING });
  });
});

describe.each(ALL)("a source's parser, in an app whose fetch is %s's", (fetch) => {
  it("is handed the body as the source reads it, and the answer's status", async () => {
    asReactNative(fetch);
    const parse: ResponseParser = (body, { status }) => ({ body, status });

    const read = createCaller(api({ responseParser: parse })).greeting.with({
      signal: new AbortController().signal,
    })();

    expect(await outcome(read)).toEqual({ value: { body: GREETING, status: 200 } });
  });
});

describe.each(ALL)("a read through the app's own fetch, in an app whose fetch is %s's", (fetch) => {
  it("resolves to the body the API sent, the request as that fetch sent it", async () => {
    asReactNative(fetch);

    const read = createCaller(api({ fetch: signed })).greeting();

    expect(await outcome(read)).toEqual({ value: GREETING });
    expect(upstream.received.at(-1)?.headers["x-signature"]).toBe("signed");
  });
});

describe.each(ALL)(
  "a call that reports its progress, through the app's own fetch, in an app whose fetch is %s's",
  (fetch) => {
    it("sends its download through that fetch", async () => {
      asReactNative(fetch);

      const read = createCaller(api({ fetch: signed })).greeting.with({
        onDownloadProgress: () => undefined,
      })();

      expect(await outcome(read)).toEqual({ value: GREETING });
      expect(upstream.received.at(-1)?.headers["x-signature"]).toBe("signed");
    });

    it("sends its upload through that fetch", async () => {
      asReactNative(fetch);

      const sent = createCaller(api({ fetch: signed })).upload.with({
        onUploadProgress: () => undefined,
      })({ note: "café ✓" });

      expect(await outcome(sent)).toEqual({
        value: { ...GREETING, received: '{"note":"café ✓"}' },
      });
      expect(upstream.received.at(-1)?.headers["x-signature"]).toBe("signed");
    });
  },
);

describe.each(ALL)("identical reads in flight, in an app whose fetch is %s's", (fetch) => {
  it("share one request, each answered with the body", async () => {
    asReactNative(fetch);
    const client = createCaller(api());

    const reads = [1, 2].map(() =>
      client.greeting.with({ signal: new AbortController().signal })(),
    );

    expect(await Promise.all(reads.map(outcome))).toEqual([
      { value: GREETING },
      { value: GREETING },
    ]);
    expect(upstream.received).toHaveLength(1);
  });

  it("answer the one that stays while the body arrives, the one that left with its cancellation", async () => {
    asReactNative(fetch);
    const client = createCaller(api());
    const leaving = new AbortController();

    const left = outcome(client.slowGreeting.with({ signal: leaving.signal })());
    const stayed = outcome(client.slowGreeting.with({ signal: new AbortController().signal })());
    await started;
    leaving.abort();
    release();

    const { error } = (await left) as { error: unknown };
    expect(isCancellation(error)).toBe(true);
    expect(await stayed).toEqual({ value: GREETING });
    expect(upstream.received).toHaveLength(1);
  });
});

describe.each(ALL)(
  "a download that reports its progress, in an app whose fetch is %s's",
  (fetch) => {
    it("resolves to its body and reports its bytes, up to the whole", async () => {
      asReactNative(fetch);
      const events: DownloadProgress[] = [];

      const read = createCaller(api()).greeting.with({
        onDownloadProgress: (p) => events.push(p),
      })();

      expect(await outcome(read)).toEqual({ value: GREETING });
      const size = Buffer.byteLength(JSON.stringify(GREETING));
      expect(events.at(-1)).toEqual({ percent: 1, transferredBytes: size, totalBytes: size });
    });

    it("resolves to a Blob of the file's bytes", async () => {
      asReactNative(fetch);
      const events: DownloadProgress[] = [];

      const file = await createCaller(api({ responseType: "blob" })).file.with({
        onDownloadProgress: (p) => events.push(p),
      })();

      expect(file).toBeInstanceOf(NativeBlob);
      expect(bytesOf(file)).toEqual(FILE);
      expect(events.at(-1)).toEqual({
        percent: 1,
        transferredBytes: FILE.length,
        totalBytes: FILE.length,
      });
    });
  },
);

describe("a call that reads its answer as it comes and reports its download, in an Expo app", () => {
  it("is handed the body's stream, counted as it is read", async () => {
    asReactNative("expo");
    const events: DownloadProgress[] = [];

    const body = await createCaller(api())
      .with({ stream: true, onDownloadProgress: (p: DownloadProgress) => events.push(p) })
      .greeting();

    expect(JSON.parse(await textOf(body as ReadableStream<Uint8Array>))).toEqual(GREETING);
    const size = Buffer.byteLength(JSON.stringify(GREETING));
    expect(events.at(-1)).toEqual({ percent: 1, transferredBytes: size, totalBytes: size });
  });
});

describe("a call that reads its answer as it comes, in an Expo app", () => {
  it("is handed the body as it arrives, its first part before the rest is sent", async () => {
    asReactNative("expo");

    const body = (await createCaller(api())
      .with({ stream: true })
      .slowGreeting()) as ReadableStream<Uint8Array>;
    const reader = body.getReader();
    const first = await within(reader.read(), 1_000);
    release();
    reader.releaseLock();

    const sent = JSON.stringify(GREETING);
    expect(new TextDecoder().decode(first.value)).toBe(sent.slice(0, 8));
    expect(await textOf(body)).toBe(sent.slice(8));
  });
});

describe("a call that reads its answer as it comes and reports its upload, in an Expo app", () => {
  it("is handed the answer's stream, sent with expo/fetch rather than XMLHttpRequest", async () => {
    asReactNative("expo");

    const body = await createCaller(api()).upload.with({
      stream: true,
      onUploadProgress: () => undefined,
    })({ note: "café ✓" });

    expect(JSON.parse(await textOf(body as ReadableStream<Uint8Array>))).toEqual({
      ...GREETING,
      received: '{"note":"café ✓"}',
    });
  });
});

describe.each(["react-native", "expo-with-react-native-fetch"] as const)(
  "a call that reads its answer as it comes, in an app whose fetch is %s's",
  (fetch) => {
    it("is refused before it is sent, as that fetch hands an answer over only once all of it has arrived", async () => {
      asReactNative(fetch);

      const read = createCaller(api()).with({ stream: true }).greeting();

      expect(await outcome(read)).toEqual(UNSTREAMED);
      expect(upstream.received).toEqual([]);
    });

    it("is refused before it is sent through the app's server's proxy", async () => {
      asReactNative(fetch);

      const read = proxied().greeting.with({ stream: true })();

      expect(await outcome(read)).toEqual(UNSTREAMED);
      expect(upstream.received).toEqual([]);
    });

    it("is refused once answered, through the app's own fetch, which sends with that one", async () => {
      asReactNative(fetch);

      const read = createCaller(api({ fetch: signed }))
        .with({ stream: true })
        .greeting();

      expect(await outcome(read)).toEqual(UNSTREAMED);
      expect(upstream.received).toHaveLength(1);
    });
  },
);

describe.each(["react-native", "expo"] as const)(
  "an upload that reports its progress, in an app whose fetch is %s's",
  (fetch) => {
    it("resolves to the answer's text outside ASCII as the API wrote it", async () => {
      asReactNative(fetch);

      const sent = createCaller(api()).upload.with({ onUploadProgress: () => undefined })({
        note: "ok",
      });

      expect(await outcome(sent)).toEqual({ value: { ...GREETING, received: '{"note":"ok"}' } });
    });

    it("resolves to a Blob of the answer", async () => {
      asReactNative(fetch);

      const sent = await createCaller(api({ responseType: "blob" })).upload.with({
        onUploadProgress: () => undefined,
      })({ note: "ok" });

      expect(sent).toBeInstanceOf(NativeBlob);
      expect(JSON.parse(new TextDecoder().decode(bytesOf(sent)))).toMatchObject(GREETING);
    });
  },
);

describe("an upload of a stream that reports its progress, in an Expo app", () => {
  it("sends the stream's bytes", async () => {
    asReactNative("expo");

    const sent = createCaller(api()).upload.with({ onUploadProgress: () => undefined })(twoParts());

    expect(await outcome(sent)).toEqual({ value: { ...GREETING, received: TWO_PARTS } });
  });
});

describe.each(ALL)("an upload, in an app whose fetch is %s's", (fetch) => {
  it("resolves to the answer to what it sent", async () => {
    asReactNative(fetch);

    const sent = createCaller(api()).upload({ note: "café ✓" });

    expect(await outcome(sent)).toEqual({ value: { ...GREETING, received: '{"note":"café ✓"}' } });
  });
});

describe.each(["expo", "expo-with-react-native-fetch"] as const)(
  "an upload of a stream, in an app whose fetch is %s's",
  (fetch) => {
    it("sends the stream's bytes", async () => {
      asReactNative(fetch);

      const sent = createCaller(api()).upload(twoParts());

      expect(await outcome(sent)).toEqual({ value: { ...GREETING, received: TWO_PARTS } });
    });
  },
);

describe("an upload of a stream that reports its progress, cancelled while it is read, in an Expo app", () => {
  it("rejects as cancelled, its stream cancelled and nothing sent", async () => {
    asReactNative("expo");
    const body = endlessBody("part one — café");
    const controller = new AbortController();

    const sent = createCaller(api()).upload.with({
      onUploadProgress: () => undefined,
      signal: controller.signal,
    })(body.stream);
    await within(body.read, 1_000);
    controller.abort();
    const settled = await within(outcome(sent), 1_000);

    expect(isCancellation((settled as { error?: unknown }).error)).toBe(true);
    await within(body.cancelled, 1_000);
    expect(upstream.received).toEqual([]);
  });
});
