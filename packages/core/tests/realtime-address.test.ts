import { describe, expect, it } from "vitest";
import { z } from "zod";
import { endpointPath } from "../src/define/address";
import { courier } from "../src/define/courier";
import { ENDPOINT_SCHEMA } from "../src/define/marker";

const EventSchema = z.object({ n: z.number() });

/**
 * A stream or channel that describes its wire says where it is. Building the
 * URL from the property name instead would quietly send the request somewhere
 * the closure never named.
 */
describe("where a realtime endpoint sits", () => {
  const { stream, channel } = courier();

  it("follows the path a stream's closure addressed", () => {
    const feed = stream.get("events/live").response(EventSchema);

    expect(feed.path).toBe("events/live");
    expect(endpointPath(feed, "feed")).toBe("events/live");
  });

  it("follows the path a channel's closure addressed", () => {
    const room = channel.connect("rooms/general").response(EventSchema);

    expect(endpointPath(room, "room")).toBe("rooms/general");
  });

  it("falls back to the endpoint's name when the closure addressed nothing", () => {
    const feed = stream.get("").response(EventSchema);

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
    const feed = stream.get("feed").response(EventSchema);

    expect((feed as unknown as { served: boolean }).served).toBe(false);
  });
});

describe("what makes a channel bidirectional", () => {
  const { channel } = courier();
  const Incoming = z.object({ text: z.string() });

  function metadata(endpoint: unknown): Record<string, unknown> {
    return (endpoint as { [ENDPOINT_SCHEMA]: Record<string, unknown> })[ENDPOINT_SCHEMA];
  }

  it("counts a send slot declared with only a type", () => {
    const room = channel.connect("room").send<{ text: string }>().response(EventSchema);

    expect(metadata(room).bidirectional).toBe(true);
    expect(metadata(room).receive).toBeUndefined();
  });

  it("counts a send slot declared with a schema, and validates against it", () => {
    const room = channel.connect("room").send(Incoming).response(EventSchema);

    expect(metadata(room).bidirectional).toBe(true);
    expect(metadata(room).receive).toBe(Incoming);
  });

  it("leaves a channel that named no send slot one-way", () => {
    const ticker = channel.connect("ticker").response(EventSchema);

    expect(metadata(ticker).bidirectional).toBeUndefined();
    expect(metadata(ticker).receive).toBeUndefined();
  });
});
