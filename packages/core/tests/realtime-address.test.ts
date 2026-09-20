import { describe, expect, it } from "vitest";
import { z } from "zod";
import { endpointPath } from "../src/define/address";
import { courier } from "../src/define/courier";

const EventSchema = z.object({ n: z.number() });

/**
 * A stream or channel that describes its wire says where it is. Building the
 * URL from the property name instead would quietly send the request somewhere
 * the closure never named.
 */
describe("where a realtime endpoint sits", () => {
  const { stream, channel } = courier();

  it("follows the path a stream's closure addressed", () => {
    const feed = stream.response(EventSchema).via((sse) => sse.get("events/live"));

    expect(feed.path).toBe("events/live");
    expect(endpointPath(feed, "feed")).toBe("events/live");
  });

  it("follows the path a channel's closure addressed", () => {
    const room = channel.response(EventSchema).via((ws) => ws.connect("rooms/general"));

    expect(endpointPath(room, "room")).toBe("rooms/general");
  });

  it("falls back to the endpoint's name when the closure addressed nothing", () => {
    const feed = stream.response(EventSchema).via((sse) => sse.get(""));

    expect(endpointPath(feed, "feed")).toBe("feed");
  });

  it("uses the name for an endpoint served in this process", () => {
    const feed = stream.response(EventSchema).implement(async function* () {
      yield { data: { n: 1 } };
    });

    expect(endpointPath(feed, "feed")).toBe("feed");
  });

  it("uses the name for anything that is not an endpoint", () => {
    expect(endpointPath(undefined, "feed")).toBe("feed");
    expect(endpointPath({}, "feed")).toBe("feed");
  });
});

describe("what a realtime server will serve", () => {
  const { stream, channel } = courier();

  it("marks an implemented endpoint as served here", () => {
    const feed = stream.response(EventSchema).implement(async function* () {
      yield { data: { n: 1 } };
    });
    const room = channel.response(EventSchema).implement(async function* () {
      yield { n: 1 };
    });

    expect((feed as unknown as { served: boolean }).served).toBe(true);
    expect((room as unknown as { served: boolean }).served).toBe(true);
  });

  it("marks an endpoint that only describes its wire as served elsewhere", () => {
    const feed = stream.response(EventSchema).via((sse) => sse.get("feed"));

    expect((feed as unknown as { served: boolean }).served).toBe(false);
  });
});
