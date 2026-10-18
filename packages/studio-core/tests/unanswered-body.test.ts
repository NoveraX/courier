/**
 * The body Courier gives a request that got no answer: why, in the shape a
 * cause takes, and nothing else the value held.
 */
import { describe, expect, it } from "vitest";

import { unansweredBody } from "../src/events/unanswered-body";

describe("the body of a request that got no answer", () => {
  it("is why no answer came, and no more", () => {
    const body = unansweredBody({
      success: false,
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.test",
      headers: { authorization: "Bearer t" },
    });

    expect(body).toEqual({
      success: false,
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.test",
    });
  });

  it("is nothing for a value with no cause in it", () => {
    expect(unansweredBody({ success: false })).toBeUndefined();
    expect(unansweredBody("refused")).toBeUndefined();
  });
});
