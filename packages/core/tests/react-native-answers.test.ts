/**
 * Answers in a React Native app, read through its own classes: React
 * Native's fetch — the whatwg-fetch polyfill over its XMLHttpRequest — or
 * Expo's, whose answer carries its body as a stream while `Response` stays
 * the polyfill's, which cannot carry one. Whatever the call does — it can be
 * cancelled, its source parses its answer, it shares an identical request in
 * flight, it goes through XMLHttpRequest for its upload's progress — it
 * resolves to what the API sent, its text decoded as UTF-8.
 */
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import type { ResponseParser } from "../src/http-client/types";
import { isCancellation } from "../src/utils/abort";
import { type AppFetch, asReactNative, bytesOf, NativeBlob } from "./helpers/react-native";
import { type ReceivedRequest, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const GREETING = { text: "Hello, café — naïve ✓ 👋" };
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
  switch (request.url) {
    case "/greeting":
      res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
      res.end(body);
      return;
    case "/upload": {
      const echo = Buffer.from(JSON.stringify({ ...GREETING, received: request.body.toString() }));
      res.writeHead(200, { "content-type": "application/json", "content-length": echo.length });
      res.end(echo);
      return;
    }
    case "/slow-greeting":
      res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
      res.write(body.subarray(0, 8), () => start());
      void held.then(() => res.end(body.subarray(8)));
      return;
    default:
      res.writeHead(404).end();
  }
}

function api(options: { responseType?: "blob"; responseParser?: ResponseParser } = {}) {
  return defineApi({
    baseURL: upstream.url,
    ...options,
    endpoints: {
      greeting: endpoint.get("greeting").response<typeof GREETING>(),
      slowGreeting: endpoint.get("slow-greeting").response<typeof GREETING>(),
      upload: endpoint.post("upload").variables<unknown>().response<unknown>(),
    },
  });
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
