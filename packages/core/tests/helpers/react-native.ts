/**
 * A React Native app's network as its JavaScript has it, over a real HTTP
 * server.
 *
 * React Native 0.88's `fetch`, `Response`, `Headers` and `Request` are the
 * whatwg-fetch polyfill — here the package itself: its fetch sends each
 * request through React Native's XMLHttpRequest and builds the answer from
 * the Blob that one hands back. Expo SDK 58 makes the app's `fetch`
 * expo/fetch, whose answer carries its body as a stream, and leaves
 * `Response`, `Headers` and `Request` the polyfill's; Metro gives the app web
 * streams. With `EXPO_PUBLIC_USE_RN_FETCH` an Expo app keeps React Native's
 * own fetch, and the streams.
 *
 * React Native's Blob, FileReader and XMLHttpRequest are modelled on their
 * sources in `Libraries/Blob` and `Libraries/Network`, and expo/fetch's
 * answer on `expo/src/winter/fetch/FetchResponse.ts`; what their native side
 * does — the network, the blob store — Node does here.
 */
import { request } from "node:http";
import { createRequire } from "node:module";
import { vi } from "vitest";

/** Whose `fetch` the app has. */
export type AppFetch = "react-native" | "expo" | "expo-with-react-native-fetch";

/* Node's own, taken before a test replaces them: the model's native side. */
const native = {
  ReadableStream: globalThis.ReadableStream,
  TransformStream: globalThis.TransformStream,
  WritableStream: globalThis.WritableStream,
  FormData: globalThis.FormData,
};

/** An answer as the native side's network has it. */
interface NativeAnswer {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly headers: Array<[string, string]>;
  /** The body as it arrives. */
  readonly chunks: AsyncIterable<Uint8Array>;
}

/* The native side's network: Node's own HTTP, which needs none of the web streams an app may
   lack — Node's fetch does. It follows no redirect. */
function sendNatively(
  url: string,
  init: { method: string; headers: Array<[string, string]>; body: Uint8Array; signal: AbortSignal },
): Promise<NativeAnswer> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      { method: init.method, headers: Object.fromEntries(init.headers), signal: init.signal },
      (incoming) => {
        const raw = incoming.rawHeaders;
        const headers: Array<[string, string]> = [];
        for (let index = 0; index < raw.length; index += 2) {
          headers.push([raw[index] ?? "", raw[index + 1] ?? ""]);
        }
        resolve({
          status: incoming.statusCode ?? 0,
          statusText: incoming.statusMessage ?? "",
          url,
          headers,
          chunks: incoming,
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(init.body.byteLength > 0 ? init.body : undefined);
  });
}

/* The bytes of each Blob, as React Native's native blob store holds them. */
const store = new WeakMap<object, Uint8Array>();

/** React Native's Blob: made of strings and other Blobs, never of bytes; it has no `text()`, `arrayBuffer()` or `stream()`. */
export class NativeBlob {
  readonly type: string;

  constructor(parts: unknown[] = [], options?: { type?: string }) {
    const bytes = parts.map((part) => {
      if (part instanceof ArrayBuffer || ArrayBuffer.isView(part)) {
        throw new Error(
          "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported",
        );
      }
      return part instanceof NativeBlob ? bytesOf(part) : new TextEncoder().encode(String(part));
    });
    store.set(this, joined(bytes));
    this.type = options?.type ?? "";
  }

  get size(): number {
    return bytesOf(this).byteLength;
  }

  /** A Blob the native side made: an XMLHttpRequest's answer, expo/fetch's `blob()`. */
  static made(bytes: Uint8Array, type: string): NativeBlob {
    const blob = new NativeBlob([], { type });
    store.set(blob, bytes);
    return blob;
  }
}

/** The bytes a React Native Blob holds, as a test reads them. */
export function bytesOf(blob: unknown): Uint8Array {
  const bytes = typeof blob === "object" && blob !== null ? store.get(blob) : undefined;
  if (bytes === undefined) throw new TypeError("parameter 1 is not of type 'Blob'");
  return bytes;
}

/** React Native's FileReader, as far as the polyfill reads a Blob with it. */
class NativeFileReader {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText(blob: unknown, encoding = "UTF-8"): void {
    const bytes = bytesOf(blob);
    this.#settle(() => new TextDecoder(encoding).decode(bytes));
  }

  readAsArrayBuffer(blob: unknown): void {
    const bytes = bytesOf(blob);
    this.#settle(() => bytes.slice().buffer);
  }

  #settle(read: () => string | ArrayBuffer): void {
    setTimeout(() => {
      this.result = read();
      this.onload?.();
    }, 0);
  }
}

/* The polyfill decides as it loads whether it reads Blobs, by whether the platform has a
   FileReader; React Native has one. */
function loadPolyfill(): Pick<typeof globalThis, "fetch" | "Response" | "Headers" | "Request"> {
  const had = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
  Object.defineProperty(globalThis, "FileReader", {
    value: NativeFileReader,
    configurable: true,
    writable: true,
  });
  try {
    return createRequire(import.meta.url)("whatwg-fetch");
  } finally {
    if (had) Object.defineProperty(globalThis, "FileReader", had);
    else Reflect.deleteProperty(globalThis, "FileReader");
  }
}

/** React Native's own fetch, Response, Headers and Request. */
export const polyfill = loadPolyfill();

/** An event of React Native's XMLHttpRequest: Node has no ProgressEvent. */
class XhrEvent extends Event {
  constructor(
    type: string,
    readonly loaded = 0,
    readonly total = -1,
  ) {
    super(type);
  }

  get lengthComputable(): boolean {
    return this.total >= 0;
  }
}

/**
 * React Native's XMLHttpRequest: it sends a string, a Blob, a form or bytes,
 * reports the upload once it is sent and the answer as it arrives, and hands
 * the answer back as its `responseType` says — a Blob from the native store
 * for `"blob"`.
 */
class NativeXMLHttpRequest extends EventTarget {
  readonly upload = new EventTarget();
  readyState = 0;
  status = 0;
  statusText = "";
  responseURL = "";
  responseType = "";
  response: unknown = "";
  withCredentials = false;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  ontimeout: ((event: Event) => void) | null = null;
  onprogress: ((event: Event) => void) | null = null;
  onreadystatechange: ((event: Event) => void) | null = null;
  #method = "GET";
  #url = "";
  readonly #headers: Array<[string, string]> = [];
  #answerHeaders = "";
  readonly #cancel = new AbortController();

  open(method: string, url: string): void {
    this.#method = method;
    this.#url = url;
    this.#state(1);
  }

  setRequestHeader(name: string, value: string): void {
    this.#headers.push([name, value]);
  }

  getAllResponseHeaders(): string {
    return this.#answerHeaders;
  }

  getResponseHeader(name: string): string | null {
    const line = this.#answerHeaders
      .split("\r\n")
      .find((each) => each.toLowerCase().startsWith(`${name.toLowerCase()}:`));
    return line === undefined ? null : line.slice(line.indexOf(":") + 1).trim();
  }

  abort(): void {
    this.#cancel.abort();
  }

  send(body: unknown): void {
    void this.#send(body);
  }

  async #send(body: unknown): Promise<void> {
    try {
      const sent = sendable(body);
      const answer = await sendNatively(this.#url, {
        method: this.#method,
        headers: this.#headers,
        body: sent,
        signal: this.#cancel.signal,
      });
      this.upload.dispatchEvent(new XhrEvent("progress", sent.byteLength, sent.byteLength));
      this.status = answer.status;
      this.statusText = answer.statusText;
      this.responseURL = answer.url;
      this.#answerHeaders = answer.headers.map(([key, value]) => `${key}: ${value}`).join("\r\n");
      this.#state(2);
      const length = headerOf(answer, "content-length");
      const total = length === undefined ? -1 : Number(length);
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for await (const chunk of answer.chunks) {
        chunks.push(chunk);
        loaded += chunk.byteLength;
        this.#state(3);
        this.#dispatch(new XhrEvent("progress", loaded, total));
      }
      this.response = answerOf(this.responseType, joined(chunks), headerOf(answer, "content-type"));
      this.#state(4);
      this.#dispatch(new XhrEvent("load"));
    } catch {
      this.#state(4);
      this.#dispatch(new XhrEvent(this.#cancel.signal.aborted ? "abort" : "error"));
    }
  }

  #state(state: number): void {
    this.readyState = state;
    this.#dispatch(new XhrEvent("readystatechange"));
  }

  #dispatch(event: XhrEvent): void {
    this.dispatchEvent(event);
    const handler: unknown = Reflect.get(this, `on${event.type}`);
    if (typeof handler === "function") handler.call(this, event);
  }
}

/* What React Native's XMLHttpRequest sends of a body, as far as these tests send one: a
   string, a Blob or bytes; anything else its native side cannot send. */
function sendable(body: unknown): Uint8Array {
  if (body === null || body === undefined) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof NativeBlob) return bytesOf(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body))
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError(
    `React Native's XMLHttpRequest cannot send ${Object.prototype.toString.call(body)}`,
  );
}

function headerOf(answer: NativeAnswer, name: string): string | undefined {
  return answer.headers.find(([key]) => key.toLowerCase() === name)?.[1];
}

function answerOf(responseType: string, bytes: Uint8Array, type: string | undefined): unknown {
  switch (responseType) {
    case "blob":
      return NativeBlob.made(bytes, type ?? "");
    case "arraybuffer":
      return bytes.slice().buffer;
    case "json":
      return JSON.parse(new TextDecoder().decode(bytes));
    default:
      return new TextDecoder().decode(bytes);
  }
}

/** expo/fetch's error: a plain Error whose message says the fetch failed. */
class FetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`fetch failed: ${message}`, options);
  }
}

/**
 * expo/fetch's answer: its body a stream the native side fills as the answer
 * arrives, never pulled before it is read; `clone()` reads a branch of it;
 * its headers are a new polyfill `Headers` each time they are asked for.
 */
class ExpoFetchResponse {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly redirected: boolean;
  readonly #raw: Array<[string, string]>;
  #body: ReadableStream<Uint8Array> | null;
  #used = false;
  #fail: ((reason: unknown) => void) | undefined;

  constructor(answer: NativeAnswer | ExpoFetchResponse, body?: ReadableStream<Uint8Array> | null) {
    this.status = answer.status;
    this.statusText = answer.statusText;
    this.url = answer.url;
    this.redirected = false;
    this.#raw = answer instanceof ExpoFetchResponse ? answer.#raw : answer.headers;
    this.#body =
      body !== undefined || answer instanceof ExpoFetchResponse
        ? (body ?? null)
        : this.#nativeBody(answer);
  }

  get type(): "default" {
    return "default";
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  get headers(): Headers {
    return new Headers(this.#raw);
  }

  get body(): ReadableStream<Uint8Array> | null {
    return this.#body;
  }

  get bodyUsed(): boolean {
    return this.#used;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return (await this.#bytes("arrayBuffer")).slice().buffer;
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(await this.#bytes("text"));
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  async blob(): Promise<NativeBlob> {
    const type = this.headers.get("content-type") ?? "";
    return NativeBlob.made(await this.#bytes("blob"), type);
  }

  async formData(): Promise<FormData> {
    const form = new native.FormData();
    for (const [key, value] of new URLSearchParams(await this.text())) form.append(key, value);
    return form;
  }

  clone(): ExpoFetchResponse {
    this.#check("clone");
    if (this.#body === null) return new ExpoFetchResponse(this, null);
    const [own, sibling] = this.#body.tee();
    this.#body = own;
    return new ExpoFetchResponse(this, sibling);
  }

  /** Fails the body still to come with `reason`, as expo/fetch does when its signal aborts. */
  abort(reason: unknown): void {
    this.#fail?.(reason);
  }

  get [Symbol.toStringTag](): string {
    return "Response";
  }

  #check(method: string): void {
    if (this.#used || this.#body?.locked === true) {
      throw new TypeError(
        `Failed to execute '${method}' on 'Response': Response body is already used.`,
      );
    }
  }

  async #bytes(method: string): Promise<Uint8Array> {
    this.#check(method);
    this.#used = true;
    if (this.#body === null) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    const reader = this.#body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      chunks.push(read.value);
    }
    return joined(chunks);
  }

  #nativeBody(answer: NativeAnswer): ReadableStream<Uint8Array> {
    const source = answer.chunks[Symbol.asyncIterator]();
    return new native.ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          this.#fail = (reason) => {
            controller.error(reason);
            void source.return?.();
          };
        },
        async pull(controller) {
          const { done, value } = await source.next();
          if (done) controller.close();
          else controller.enqueue(value);
        },
        cancel: async () => {
          await source.return?.();
        },
      },
      { highWaterMark: 0 },
    );
  }
}

/** expo/fetch: it reads a stream it is to send whole, and fails a cancelled request with a FetchError. */
async function expoFetch(input: string | URL, init: RequestInit = {}): Promise<ExpoFetchResponse> {
  const { signal } = init;
  const body = await expoBody(init.body);
  if (signal?.aborted) throw new FetchError("The operation was aborted.", { cause: signal.reason });
  const cancel = new AbortController();
  let response: ExpoFetchResponse | undefined;
  signal?.addEventListener("abort", () => {
    response?.abort(signal.reason);
    cancel.abort();
  });
  try {
    const answer = await sendNatively(String(input), {
      method: init.method ?? "GET",
      headers: [...new Headers(init.headers)] as Array<[string, string]>,
      body,
      signal: cancel.signal,
    });
    response = new ExpoFetchResponse(answer);
    return response;
  } catch (error) {
    throw new FetchError(cancel.signal.aborted ? "The operation was aborted." : String(error));
  }
}

async function expoBody(body: unknown): Promise<Uint8Array> {
  if (body instanceof native.ReadableStream) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as ReadableStream<Uint8Array>) chunks.push(chunk);
    return joined(chunks);
  }
  return sendable(body instanceof URLSearchParams ? body.toString() : body);
}

/** React Native's AbortController: `abort()` keeps no reason. */
class ReasonlessAbortController extends AbortController {
  constructor() {
    super();
    Object.defineProperty(this.signal, "reason", { get: () => undefined });
  }
}

/**
 * Make the rest of the test run in a React Native app whose `fetch` is the
 * one named, until `vi.unstubAllGlobals()`.
 *
 * @param fetch - React Native's own, Expo's, or React Native's own under Expo
 * @example
 * ```ts
 * asReactNative("expo");
 * await createCaller(api).items.with({ signal })();
 * ```
 */
export function asReactNative(fetch: AppFetch): void {
  vi.stubGlobal("navigator", { product: "ReactNative" });
  vi.stubGlobal("location", undefined);
  vi.stubGlobal("AbortController", ReasonlessAbortController);
  vi.stubGlobal("Blob", NativeBlob);
  vi.stubGlobal("FileReader", NativeFileReader);
  vi.stubGlobal("XMLHttpRequest", NativeXMLHttpRequest);
  vi.stubGlobal("Response", polyfill.Response);
  vi.stubGlobal("Headers", polyfill.Headers);
  vi.stubGlobal("Request", polyfill.Request);
  const streams = fetch !== "react-native";
  vi.stubGlobal("ReadableStream", streams ? native.ReadableStream : undefined);
  vi.stubGlobal("TransformStream", streams ? native.TransformStream : undefined);
  vi.stubGlobal("WritableStream", streams ? native.WritableStream : undefined);
  vi.stubGlobal("fetch", fetch === "expo" ? expoFetch : polyfill.fetch);
}

function joined(chunks: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    whole.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return whole;
}
