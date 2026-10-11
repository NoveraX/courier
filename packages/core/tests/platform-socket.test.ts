/**
 * A socket is opened as each platform's WebSocket takes it: the class the
 * source names with an options object; Node's and Bun's own with one when
 * there are headers or connection options to carry; React Native's with
 * its headers third; a browser's with its protocols alone, whatever
 * connection options the source gives — a browser has its own proxy and
 * its own trust.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { platformSocketFactory } from "../src/realtime/ws/platform-socket";

const constructed: unknown[][] = [];

/* Records how it was constructed, as the platform's WebSocket would be. */
class RecordingSocket {
  constructor(...args: unknown[]) {
    constructed.push(args);
  }
}

const URL_ = "wss://feed.example/live";
const dispatcher = { kind: "dispatcher" };

afterEach(() => {
  constructed.length = 0;
  vi.unstubAllGlobals();
});

describe("the platform's WebSocket on Node", () => {
  it("is given protocols alone when there is nothing else to carry", () => {
    vi.stubGlobal("WebSocket", RecordingSocket);

    platformSocketFactory(undefined, undefined)(URL_, ["courier"]);

    expect(constructed).toEqual([[URL_, ["courier"]]]);
  });

  it("is given the source's connection options in its options", () => {
    vi.stubGlobal("WebSocket", RecordingSocket);

    platformSocketFactory(undefined, { dispatcher })(URL_, ["courier"], {
      authorization: "Bearer t1",
    });

    expect(constructed).toEqual([
      [URL_, { dispatcher, protocols: ["courier"], headers: { authorization: "Bearer t1" } }],
    ]);
  });

  it("keeps the socket's own protocols and headers over options of the same name", () => {
    vi.stubGlobal("WebSocket", RecordingSocket);

    platformSocketFactory(undefined, { protocols: ["other"], headers: { a: "b" } })(
      URL_,
      ["courier"],
      {
        authorization: "Bearer t1",
      },
    );

    expect(constructed).toEqual([
      [URL_, { protocols: ["courier"], headers: { authorization: "Bearer t1" } }],
    ]);
  });

  it("is the one installed when the socket opens, not when the factory was made", () => {
    const open = platformSocketFactory(undefined, undefined);
    vi.stubGlobal("WebSocket", RecordingSocket);

    open(URL_);

    expect(constructed).toEqual([[URL_, undefined]]);
  });
});

describe("a browser's WebSocket", () => {
  it("is given protocols alone, though the source names connection options", () => {
    vi.stubGlobal("WebSocket", RecordingSocket);
    vi.stubGlobal("document", {});

    platformSocketFactory(undefined, { proxy: "http://proxy.corp:3128" })(URL_, ["courier"]);

    expect(constructed).toEqual([[URL_, ["courier"]]]);
  });
});

describe("React Native's WebSocket", () => {
  it("is given the handshake's headers third", () => {
    vi.stubGlobal("WebSocket", RecordingSocket);
    vi.stubGlobal("navigator", { product: "ReactNative" });

    platformSocketFactory(undefined, undefined)(URL_, ["courier"], { authorization: "Bearer t1" });

    expect(constructed).toEqual([[URL_, ["courier"], { headers: { authorization: "Bearer t1" } }]]);
  });

  it("is given protocols alone when there are no headers", () => {
    vi.stubGlobal("WebSocket", RecordingSocket);
    vi.stubGlobal("navigator", { product: "ReactNative" });

    platformSocketFactory(undefined, undefined)(URL_);

    expect(constructed).toEqual([[URL_, undefined]]);
  });
});

describe("the class a source names", () => {
  it("is constructed with an options object holding everything the socket opens with", () => {
    vi.stubGlobal("WebSocket", undefined);

    platformSocketFactory(RecordingSocket, { dispatcher })(URL_, ["courier"], {
      authorization: "Bearer t1",
    });

    expect(constructed).toEqual([
      [URL_, { dispatcher, protocols: ["courier"], headers: { authorization: "Bearer t1" } }],
    ]);
  });

  it("is given an options object, even an empty one, where there is nothing to carry", () => {
    platformSocketFactory(RecordingSocket, undefined)(URL_);

    expect(constructed).toEqual([[URL_, {}]]);
  });
});
