/**
 * A progress callback that throws, on every way a call is sent.
 *
 * What the app's callback throws is the call's failure, as it was thrown:
 * not the network's, which a retry would send again, and never a call that
 * waits for ever. Counted through fetch, a throw failed the read as the
 * network's, and a retry policy sent the call again; through
 * XMLHttpRequest, a throw while the answer came in reached no one, and one
 * when it had come left the call unanswered.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import type { DownloadProgress, UploadProgress } from "../src/http-client/types";
import { type AppFetch, asReactNative } from "./helpers/react-native";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const GREETING = { text: "Hello, café — naïve ✓" };
const ALL: AppFetch[] = ["react-native", "expo", "expo-with-react-native-fetch"];
const RETRIED = { limit: 2, delay: 1, backoff: "fixed" } as const;
let upstream: Upstream | undefined;
let closeServer: (() => Promise<void>) | undefined;

afterEach(async () => {
  await upstream?.close();
  await closeServer?.();
  upstream = closeServer = undefined;
});

/* What the app's callback throws: its own error, which no one else makes. */
class BarFailed extends Error {
  override readonly name = "BarFailed";
}

function api(baseURL: string) {
  return defineApi({
    baseURL,
    endpoints: {
      greeting: endpoint.get("greeting").retry(RETRIED).response<typeof GREETING>(),
      upload: endpoint
        .post("upload")
        .retry({ ...RETRIED, mutations: true })
        .variables<unknown>()
        .response<unknown>(),
    },
  });
}

/* An API that answers every call with the greeting, its length declared unless `declared` is false. */
async function greeter({ declared = true } = {}): Promise<Upstream> {
  return startUpstream((_request, res) => {
    const body = Buffer.from(JSON.stringify(GREETING));
    res.writeHead(200, {
      "content-type": "application/json",
      ...(declared && { "content-length": body.length }),
    });
    res.end(body);
  });
}

/* How a call ended within `ms`, or that it had not. */
async function settled(call: Promise<unknown>, ms = 2_000): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Promise((resolve) => {
    timer = setTimeout(() => resolve("still waiting"), ms);
  });
  const ended = call.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  return Promise.race([ended, pending]).finally(() => clearTimeout(timer));
}

/* A callback that throws once the report it is given passes `from`. */
function failingAt<TProgress extends UploadProgress | DownloadProgress>(
  failure: Error,
  from: number,
): (progress: TProgress) => void {
  return (progress) => {
    if (progress.percent >= from) throw failure;
  };
}

describe("a download counted on a server, whose callback throws", () => {
  it("fails with what the callback threw, sent once", async () => {
    upstream = await greeter();
    const failure = new BarFailed("the bar went past 100 % — naïve");

    const call = createCaller(api(upstream.url)).greeting.with({
      onDownloadProgress: failingAt(failure, 0),
    })();

    expect(await settled(call)).toEqual({ error: failure });
    expect(upstream.received).toHaveLength(1);
  });
});

describe("an upload counted on a server, whose callback throws", () => {
  it("fails with what the callback threw, sent once", async () => {
    let attempts = 0;
    const server = createServer((request, res) => {
      attempts += 1;
      request.resume();
      request.on("end", () => res.end("{}"));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closeServer = () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const failure = new BarFailed("the bar went past 100 % — naïve");
    const form = new FormData();
    form.append("file", new File([new Uint8Array(256 * 1024).fill(7)], "café.bin"));

    const call = createCaller(api(url)).upload.with({
      onUploadProgress: failingAt(failure, 0),
    })(form);

    expect(await settled(call)).toEqual({ error: failure });
    expect(attempts).toBeLessThanOrEqual(1);
  });
});

describe.each(ALL)("a download through XMLHttpRequest, in an app whose fetch is %s's", (fetch) => {
  it("fails with what the callback threw as the answer came in", async () => {
    upstream = await greeter();
    asReactNative(fetch);
    const failure = new BarFailed("the bar went past 100 % — naïve");

    const call = createCaller(api(upstream.url)).greeting.with({
      onDownloadProgress: failingAt(failure, 0),
    })();

    expect(await settled(call)).toEqual({ error: failure });
    expect(upstream.received).toHaveLength(1);
  });

  it("fails with what the callback threw once an answer of no declared length had come, rather than wait for ever", async () => {
    /* Of no declared length, the answer's end is reported once it has loaded. */
    upstream = await greeter({ declared: false });
    asReactNative(fetch);
    const failure = new BarFailed("the bar went past 100 % — naïve");

    const call = createCaller(api(upstream.url)).greeting.with({
      onDownloadProgress: failingAt(failure, 1),
    })();

    expect(await settled(call)).toEqual({ error: failure });
    expect(upstream.received).toHaveLength(1);
  });
});

describe.each(ALL)("an upload through XMLHttpRequest, in an app whose fetch is %s's", (fetch) => {
  it("fails with what the callback threw", async () => {
    upstream = await greeter();
    asReactNative(fetch);
    const failure = new BarFailed("the bar went past 100 % — naïve");

    const call = createCaller(api(upstream.url)).upload.with({
      onUploadProgress: failingAt(failure, 0),
    })("a body of its own — café ✓");

    expect(await settled(call)).toEqual({ error: failure });
    expect(upstream.received).toHaveLength(1);
  });
});
