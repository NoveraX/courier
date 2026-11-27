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
 * streams, and Expo a `URL` and a `URLSearchParams` of the standard's in
 * place of React Native's. With `EXPO_PUBLIC_USE_RN_FETCH` an Expo app
 * keeps React Native's own fetch, and the streams and the URL.
 *
 * React Native's Blob, FileReader, URL, URLSearchParams, XMLHttpRequest
 * and WebSocket are modelled on their sources in `Libraries/Blob`,
 * `Libraries/Network` and `Libraries/WebSocket`, and expo/fetch's answer on
 * `expo/src/winter/fetch/FetchResponse.ts`; what their native side does —
 * the network, the blob store, OkHttp's and SocketRocket's sockets — Node
 * and the `ws` package do here.
 */
import { request } from "node:http";
import { createRequire } from "node:module";
import { vi } from "vitest";
import { WebSocket as WsClient } from "ws";

/** Whose `fetch` the app has. */
export type AppFetch = "react-native" | "expo" | "expo-with-react-native-fetch";

/* Node's own, taken before a test replaces them: the model's native side. */
const native = {
  ReadableStream: globalThis.ReadableStream,
  TransformStream: globalThis.TransformStream,
  WritableStream: globalThis.WritableStream,
  FormData: globalThis.FormData,
  URL: globalThis.URL,
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

/** React Native's MessageEvent, as its WebSocket dispatches one. */
class NativeMessageEvent extends Event {
  constructor(readonly data: unknown) {
    super("message");
  }
}

/** React Native's CloseEvent: its WebSocket gives it a code and a reason, and never `wasClean`. */
class NativeCloseEvent extends Event {
  readonly wasClean = false;

  constructor(
    readonly code: number,
    readonly reason: string,
  ) {
    super("close");
  }
}

/** A close React Native's native side did not make: Android's OkHttp refuses its code or its reason. */
export interface RefusedClose {
  readonly code: number;
  readonly reason: string;
}

/* What OkHttp closes a socket with: a code from 1000 to 4999 that RFC 6455 does not reserve, and
   a reason of 123 bytes at most. Any other it refuses, and React Native logs it and leaves the
   socket open. */
function closeTaken(code: number, reason: string): boolean {
  const reserved = (code >= 1004 && code <= 1006) || (code >= 1015 && code <= 2999);
  return code >= 1000 && code < 5000 && !reserved && Buffer.byteLength(reason) <= 123;
}

/* What the native side opens a socket with: the app's headers, and an `Origin` of the socket's own
   address — its scheme as HTTP's, its host and port — where they name none, as Android's module and
   iOS's SocketRocket both send. */
function handshakeOf(
  url: string,
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  if (Object.keys(headers).some((name) => name.toLowerCase() === "origin")) return { ...headers };
  const { protocol, host } = new native.URL(url);
  const scheme =
    protocol === "wss:" ? "https" : protocol === "ws:" ? "http" : protocol.slice(0, -1);
  return { ...headers, origin: `${scheme}://${host}` };
}

type NativeListener = { readonly handleEvent: (event: Event) => void };

/**
 * React Native's WebSocket, as `Libraries/WebSocket/WebSocket.js` has it;
 * its native side, OkHttp's and SocketRocket's, the `ws` package's client.
 * It is made with an address, protocols and `{ headers }`, and opens with
 * them and the `Origin` of its own address. What happens to it comes as
 * events: its opening; a message — text, or bytes as an ArrayBuffer, or a
 * Blob once `binaryType` is `"blob"`; a close the server sent, with its code
 * and reason; and a failure — refused, cut, unreachable — as an `error`, then
 * a close of 1006 whose reason is the native side's message. It throws on a
 * send while it connects, never sets `bufferedAmount`, and a close with a
 * code or a reason OkHttp refuses leaves its socket open, as on Android.
 */
export class NativeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  /** Each socket made, in order, until `forgetSockets()` */
  static readonly made: NativeWebSocket[] = [];
  /** Each close the native side refused, until `forgetSockets()` */
  static readonly refused: RefusedClose[] = [];

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  /** Declared and never set, as React Native's is. */
  readonly bufferedAmount?: number;
  readyState = 0;
  protocol: string | undefined;
  readonly url: string;
  /** The headers the native side opened the socket with */
  readonly handshake: Readonly<Record<string, string>>;
  readonly #native: WsClient;
  readonly #handlers = new Map<string, NativeListener>();
  #binaryType: "blob" | "arraybuffer" | undefined;
  #ended = false;
  #stalled = false;

  constructor(
    url: string,
    protocols?: string | string[] | null,
    options?: { readonly headers?: Readonly<Record<string, string>> } | null,
  ) {
    super();
    this.url = url;
    const listed = typeof protocols === "string" ? [protocols] : (protocols ?? []);
    const { headers = {}, ...unrecognized } = options ?? {};
    if (Object.keys(unrecognized).length > 0) {
      console.warn(
        `Unrecognized WebSocket connection option(s) \`${Object.keys(unrecognized).join("`, `")}\`. Did you mean to put these under \`headers\`?`,
      );
    }
    this.handshake = handshakeOf(url, headers);
    this.#native = new WsClient(url, listed, { headers: this.handshake });
    NativeWebSocket.made.push(this);
    this.#native.on("open", () => {
      this.readyState = 1;
      this.protocol = this.#native.protocol;
      this.dispatchEvent(new Event("open"));
    });
    this.#native.on("message", (data: Buffer, binary: boolean) => {
      if (this.#stalled) return;
      this.dispatchEvent(new NativeMessageEvent(binary ? this.#bytes(data) : data.toString()));
    });
    this.#native.on("error", (error: Error) => this.#failed(error.message));
    /* A socket that ends with no close of the server's — cut on the way — fails, as OkHttp's does. */
    this.#native.on("close", (code: number, reason: Buffer) => {
      if (code === 1006) this.#failed("Socket closed");
      else this.#closed(code, reason.toString());
    });
  }

  get binaryType(): "blob" | "arraybuffer" | undefined {
    return this.#binaryType;
  }

  set binaryType(type: "blob" | "arraybuffer") {
    if (type !== "blob" && type !== "arraybuffer") {
      throw new Error("binaryType must be either 'blob' or 'arraybuffer'");
    }
    this.#binaryType = type;
  }

  get onopen(): ((event: Event) => void) | null {
    return this.#handler("open");
  }

  set onopen(callback: ((event: Event) => void) | null) {
    this.#handle("open", callback);
  }

  get onmessage(): ((event: Event) => void) | null {
    return this.#handler("message");
  }

  set onmessage(callback: ((event: Event) => void) | null) {
    this.#handle("message", callback);
  }

  get onclose(): ((event: Event) => void) | null {
    return this.#handler("close");
  }

  set onclose(callback: ((event: Event) => void) | null) {
    this.#handle("close", callback);
  }

  get onerror(): ((event: Event) => void) | null {
    return this.#handler("error");
  }

  set onerror(callback: ((event: Event) => void) | null) {
    this.#handle("error", callback);
  }

  send(data: unknown): void {
    if (this.readyState === 0) throw new Error("INVALID_STATE_ERR");
    /* Android's module, asked to send on a socket it has let go of, reports it failed. */
    if (this.#native.readyState !== 1) {
      this.#failed("client is null");
      return;
    }
    if (this.#stalled) return;
    if (data instanceof NativeBlob) this.#native.send(bytesOf(data));
    else if (typeof data === "string") this.#native.send(data);
    else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) this.#native.send(data);
    else throw new Error("Unsupported data type");
  }

  ping(): void {
    if (this.readyState === 0) throw new Error("INVALID_STATE_ERR");
    this.#native.ping();
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === 2 || this.readyState === 3) return;
    this.readyState = 2;
    const statusCode = typeof code === "number" ? code : 1000;
    const closeReason = typeof reason === "string" ? reason : "";
    if (!closeTaken(statusCode, closeReason)) {
      NativeWebSocket.refused.push({ code: statusCode, reason: closeReason });
      return;
    }
    this.#native.close(statusCode, closeReason);
  }

  /** Cut the socket's connection where it runs, as a network that went away does. */
  cut(): void {
    this.#native.terminate();
  }

  /**
   * Let nothing through any more, either way, and close nothing: the socket a
   * network the device left behind holds open, as a NAT that forgot it does.
   */
  stall(): void {
    this.#stalled = true;
  }

  #bytes(data: Buffer): ArrayBuffer | NativeBlob {
    const bytes = new Uint8Array(data);
    return this.#binaryType === "blob" ? NativeBlob.made(bytes, "") : bytes.buffer;
  }

  #failed(message: string): void {
    if (this.#ended || this.#stalled) return;
    this.#ended = true;
    this.readyState = 3;
    this.dispatchEvent(new Event("error"));
    this.dispatchEvent(new NativeCloseEvent(1006, message));
    this.#native.terminate();
  }

  #closed(code: number, reason: string): void {
    if (this.#ended || this.#stalled) return;
    this.#ended = true;
    this.readyState = 3;
    this.dispatchEvent(new NativeCloseEvent(code, reason));
  }

  #handler(type: string): ((event: Event) => void) | null {
    return this.#handlers.get(type)?.handleEvent ?? null;
  }

  /* As React Native's event handler attributes: a listener of its own, replaced when set again. */
  #handle(type: string, callback: ((event: Event) => void) | null | undefined): void {
    const current = this.#handlers.get(type);
    if (current !== undefined) {
      this.removeEventListener(type, current);
      this.#handlers.delete(type);
    }
    if (typeof callback !== "function") return;
    const listener: NativeListener = { handleEvent: callback };
    this.addEventListener(type, listener);
    this.#handlers.set(type, listener);
  }
}

/** Forget the sockets an app made and the closes refused, and cut those still open. */
export function forgetSockets(): void {
  for (const socket of NativeWebSocket.made.splice(0)) socket.cut();
  NativeWebSocket.refused.length = 0;
}

/* The addresses React Native's URL takes a base for: an http, https or ftp one, or one from `//`. */
const BASE_ADDRESS =
  /^(?:(?:(?:https?|ftp):)?\/\/)(?:(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9¡-￿][a-z0-9¡-￿_-]{0,62})?[a-z0-9¡-￿]\.)*(?:[a-z¡-￿]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/;

/**
 * React Native's URL, without Expo: it reads an address with patterns of
 * an http or https one, refuses none, joins a relative one to its base as
 * text, and has no setter but its query's — `protocol`, `host` and the
 * rest have none, so setting one throws.
 */
export class NativeURL {
  _url: string;
  _searchParamsInstance: NativeURLSearchParams | null = null;

  constructor(url: string, base?: string | NativeURL) {
    if (!base || BASE_ADDRESS.test(url)) {
      this._url = url;
      if (this._url.includes("#")) {
        const split = this._url.split("#");
        const website = (split[0] as string).split("://")[1] as string;
        if (!website.includes("/")) this._url = split.join("/#");
      }
      if (!this._url.endsWith("/") && !(this._url.includes("?") || this._url.includes("#"))) {
        const afterProtocol = this._url.split("://")[1];
        if (afterProtocol && !afterProtocol.includes("/")) this._url += "/";
      }
      return;
    }
    let baseUrl = base.toString();
    if (typeof base === "string" && !BASE_ADDRESS.test(baseUrl)) {
      throw new TypeError(`Invalid base URL: ${baseUrl}`);
    }
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    let path = url.startsWith("/") ? url : `/${url}`;
    if (baseUrl.endsWith(path)) path = "";
    this._url = `${baseUrl}${path}`;
  }

  get hash(): string {
    const hash = this._url.match(/#([^/]*)/);
    return hash ? `#${hash[1]}` : "";
  }

  get host(): string {
    const host = this._url.match(/^https?:\/\/(?:[^@]+@)?([^:/?#]+)/);
    const port = this._url.match(/:(\d+)(?=[/?#]|$)/);
    return host ? `${host[1]}${port ? `:${port[1]}` : ""}` : "";
  }

  get hostname(): string {
    return this._url.match(/^https?:\/\/(?:[^@]+@)?([^:/?#]+)/)?.[1] ?? "";
  }

  get href(): string {
    return this.toString();
  }

  get origin(): string {
    return this._url.match(/^(https?:\/\/[^/]+)/)?.[1] ?? "";
  }

  get password(): string {
    return this._url.match(/https?:\/\/.*:(.*)@/)?.[1] ?? "";
  }

  get pathname(): string {
    const path = this._url.match(/https?:\/\/[^/]+(\/[^?#]*)?/);
    return path ? path[1] || "/" : "/";
  }

  get port(): string {
    return this._url.match(/:(\d+)(?=[/?#]|$)/)?.[1] ?? "";
  }

  get protocol(): string {
    const protocol = this._url.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/);
    return protocol ? `${protocol[1]}:` : "";
  }

  get search(): string {
    const search = this._url.match(/\?([^#]*)/);
    return search ? `?${search[1]}` : "";
  }

  set search(value: string) {
    const search = value.startsWith("?") ? value.slice(1) : value;
    const before = (this._url.split("?")[0] as string).split("#")[0] as string;
    const hash = this.hash;
    this._url = search ? `${before}?${search}${hash}` : `${before}${hash}`;
    this._searchParamsInstance = null;
  }

  get searchParams(): NativeURLSearchParams {
    this._searchParamsInstance ??= new NativeURLSearchParams(this.search);
    return this._searchParamsInstance;
  }

  get username(): string {
    return this._url.match(/^https?:\/\/([^:@]+)(?::[^@]*)?@/)?.[1] ?? "";
  }

  toJSON(): string {
    return this.toString();
  }

  toString(): string {
    if (this._searchParamsInstance === null) return this._url;
    const before = (this._url.split("?")[0] as string).split("#")[0] as string;
    const query = this._searchParamsInstance.toString();
    return query ? `${before}?${query}${this.hash}` : `${before}${this.hash}`;
  }
}

/**
 * React Native's URLSearchParams, without Expo: its values kept by name,
 * in the order each name came first, each encoded as `encodeURIComponent`
 * does, a space as `+`.
 */
export class NativeURLSearchParams {
  _searchParams = new Map<string, string[]>();

  constructor(params?: Record<string, string> | string | Array<[string, string]> | null) {
    if (params === null) return;
    if (typeof params === "string") {
      for (const pair of params.replace(/^\?/, "").split("&")) {
        if (!pair) continue;
        const [key, value] = pair
          .split("=")
          .map((part) => decodeURIComponent(part.replace(/\+/g, " ")));
        this.append(key as string, value as string);
      }
    } else if (Array.isArray(params)) {
      for (const [key, value] of params) this.append(key, value);
    } else if (typeof params === "object") {
      for (const [key, value] of Object.entries(params)) this.append(key, value);
    }
  }

  get size(): number {
    return this._searchParams.size;
  }

  append(key: string, value: string): void {
    const values = this._searchParams.get(key);
    if (values === undefined) this._searchParams.set(key, [value]);
    else values.push(value);
  }

  delete(name: string): void {
    this._searchParams.delete(name);
  }

  get(name: string): string | null {
    return this._searchParams.get(name)?.[0] ?? null;
  }

  getAll(name: string): string[] {
    return this._searchParams.get(name) ?? [];
  }

  has(name: string): boolean {
    return this._searchParams.has(name);
  }

  set(name: string, value: string): void {
    this._searchParams.set(name, [value]);
  }

  keys(): IterableIterator<string> {
    return this._searchParams.keys();
  }

  *values(): IterableIterator<string> {
    for (const values of this._searchParams.values()) yield* values;
  }

  *entries(): IterableIterator<[string, string]> {
    for (const [key, values] of this._searchParams) {
      for (const value of values) yield [key, value];
    }
  }

  forEach(callback: (value: string, key: string, params: this) => void): void {
    for (const [key, value] of this.entries()) callback(value, key, this);
  }

  sort(): void {
    this._searchParams = new Map(
      [...this._searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return [...this.entries()][Symbol.iterator]();
  }

  toString(): string {
    const encoded = (text: string): string => encodeURIComponent(text).replace(/%20/g, "+");
    return [...this._searchParams.entries()]
      .map(([key, values]) => values.map((value) => `${encoded(key)}=${encoded(value)}`).join("&"))
      .join("&");
  }
}

/**
 * React Native's AbortController up to 0.86, Expo SDK 57's too: `abort()`
 * keeps no reason. 0.88's keeps it; an app is run with this one, the
 * stricter of the two.
 */
export class ReasonlessAbortController extends AbortController {
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
  vi.stubGlobal("WebSocket", NativeWebSocket);
  vi.stubGlobal("Response", polyfill.Response);
  vi.stubGlobal("Headers", polyfill.Headers);
  vi.stubGlobal("Request", polyfill.Request);
  const expo = fetch !== "react-native";
  vi.stubGlobal("ReadableStream", expo ? native.ReadableStream : undefined);
  vi.stubGlobal("TransformStream", expo ? native.TransformStream : undefined);
  vi.stubGlobal("WritableStream", expo ? native.WritableStream : undefined);
  if (!expo) {
    vi.stubGlobal("URL", NativeURL);
    vi.stubGlobal("URLSearchParams", NativeURLSearchParams);
  }
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
