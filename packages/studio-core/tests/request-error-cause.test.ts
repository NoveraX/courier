import { createKeptBodies, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent, RequestErrorEvent } from "../src/events";
import { wireRequestHooks } from "../src/runtime/hooks/request";

function wired(): AnyStudioEvent[] {
  const bus = new EventBus();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => {
    events.push(event);
  });
  wireRequestHooks(bus, "app", (name) => name, createKeptBodies());
  return events;
}

function failedWith(cause: unknown): RequestErrorEvent["error"] | undefined {
  const events = wired();
  studioHooks.onRequestError?.({
    id: "req_1",
    timestamp: 1,
    error: {
      type: "network",
      message: "Network request failed",
      cause: cause as { code?: string; message: string },
    },
  });
  return (events[0] as RequestErrorEvent | undefined)?.error;
}

afterEach(() => {
  studioHooks.onRequestError = undefined;
});

describe("why a request got no answer, as its event carries it", () => {
  it("carries the system's code and text", () => {
    const error = failedWith({
      code: "DEPTH_ZERO_SELF_SIGNED_CERT",
      message: "self-signed certificate",
    });

    expect(error).toEqual({
      type: "network",
      message: "Network request failed",
      cause: { code: "DEPTH_ZERO_SELF_SIGNED_CERT", message: "self-signed certificate" },
    });
  });

  it("carries a browser's text, which has no code, as it is", () => {
    expect(failedWith({ message: "Failed to fetch" })?.cause).toEqual({
      message: "Failed to fetch",
    });
  });

  it("cuts a token and a password out of a URL in the text", () => {
    const cause = failedWith({
      code: "ECONNREFUSED",
      message: "connect to https://user:pass@api.test/v1?token=s3cret failed",
    })?.cause;

    expect(cause).toEqual({
      code: "ECONNREFUSED",
      message: "connect to https://api.test/v1 failed",
    });
  });

  it("drops a code that is not a system error code", () => {
    expect(failedWith({ code: "Bearer abc", message: "failed" })?.cause).toEqual({
      message: "failed",
    });
  });

  it("carries no cause when the failure has none", () => {
    expect(failedWith(undefined)).not.toHaveProperty("cause");
  });
});
