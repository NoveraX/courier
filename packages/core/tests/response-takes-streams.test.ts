/**
 * Whether the platform makes a `Response` of a stream decides how a call
 * reads its answer, how it sends a stream and whether XMLHttpRequest counts
 * its download. A server's `Response` takes one; React Native's, the
 * whatwg-fetch polyfill, takes none, and without Expo React Native has no
 * streams at all. A `Response` made of streams was taken for one that takes
 * a stream even where no global stream was left to make one of, and Node
 * 22's then failed the read with "Right-hand side of 'instanceof' is not an
 * object".
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { responseTakesStreams } from "../src/utils/response-takes-streams";
import { polyfill } from "./helpers/react-native";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("whether the platform makes a Response of a stream", () => {
  it("is so on a server", () => {
    expect(responseTakesStreams()).toBe(true);
  });

  it("is not so with React Native's own Response, the polyfill's", () => {
    vi.stubGlobal("Response", polyfill.Response);

    expect(responseTakesStreams()).toBe(false);
  });

  it("is not so where the platform has no ReadableStream", () => {
    vi.stubGlobal("ReadableStream", undefined);

    expect(responseTakesStreams()).toBe(false);
  });

  it("is so without TransformStream, which no body is passed through", () => {
    vi.stubGlobal("TransformStream", undefined);

    expect(responseTakesStreams()).toBe(true);
  });
});
