/**
 * Every browser Courier runs in makes a `Response` of a stream. A page's
 * bundle takes a stand-in that says so without asking, and carries none of
 * the ways a call goes where no `Response` takes one, as in React Native.
 */
import { describe, expect, it } from "vitest";

import { responseTakesStreams } from "../../../src/browser/utils/response-takes-streams";

describe("whether a page makes a Response of a stream", () => {
  it("is so", () => {
    expect(responseTakesStreams()).toBe(true);
  });
});
