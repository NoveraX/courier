/**
 * A path that writes a fragment is refused: what follows `#` never reaches
 * the server, so `items#top` sent its read's query after the fragment,
 * where the request dropped it, and `items?sort=asc#top` sent the fragment
 * as part of a query value. A path is refused where an endpoint, a closure
 * or a group declares it — an endpoint's own literal by its type too, while
 * the types take a closure's path and a group's prefix as any string — and
 * a closure's path again when a call is addressed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { ConfigurationError, HTTPError } from "../src/errors";
import { RealtimeValidationError } from "../src/realtime/errors";
import { addressCall } from "../src/transport/direct/address";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint, stream, channel } = courier();

function codeOf(declare: () => unknown): string | undefined {
  try {
    declare();
  } catch (error) {
    return error instanceof ConfigurationError ? error.code : String(error);
  }
  return undefined;
}

describe("a path declared with a fragment", () => {
  it("is refused where an endpoint, a stream or a channel declares it", () => {
    // @ts-expect-error — a request sends its path up to the #
    expect(codeOf(() => endpoint.get("items#top"))).toBe("PATH_FRAGMENT");
    // @ts-expect-error — a # inside the query is refused too
    expect(codeOf(() => endpoint.post("items?sort=asc#top"))).toBe("PATH_FRAGMENT");
    // @ts-expect-error — a stream's path is checked the same way
    expect(codeOf(() => stream.get("rooms#feed"))).toBe("PATH_FRAGMENT");
    // @ts-expect-error — and a channel's
    expect(codeOf(() => channel.connect("rooms#chat"))).toBe("PATH_FRAGMENT");
  });

  it("is refused where a closure or a group's prefix writes it, which no type refuses", () => {
    expect(codeOf(() => endpoint.via((http) => http.get("items#top")))).toBe("PATH_FRAGMENT");
    expect(codeOf(() => defineGroup({ prefix: "v1#x", endpoints: {} }))).toBe("PATH_FRAGMENT");
  });

  it("says why, and how to send a # the path means", () => {
    expect(() => endpoint.get("items#top" as string)).toThrow(
      '[courier] .get("items#top") writes a fragment, which never reaches the server: a request sends its path up to the #, without a read\'s query either. Write %23 for a # the path sends.',
    );
  });

  it("is taken with the # written as %23", () => {
    expect(codeOf(() => endpoint.get("tags/c%23"))).toBeUndefined();
  });
});

describe("a closure's path that holds a # when a call is addressed", () => {
  let upstream: Upstream;

  beforeEach(async () => {
    upstream = await startUpstream(echo);
  });

  afterEach(async () => {
    await upstream.close();
  });

  it("is refused before any request is sent, as a path's parameter is", async () => {
    const api = defineApi({
      name: "tags",
      baseURL: `${upstream.url}/echo`,
      endpoints: {
        tagged: endpoint
          .variables<{ tag: string }>()
          .via((http, { tag }) => http.get(`tags/${tag}`, undefined)),
      },
    });

    const error = await createCaller(api)
      .tagged({ tag: "c#" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(400);
    expect((error as HTTPError).message).toBe(
      "A path holds a #, which never reaches the server: write %23 for a # it sends, or put a value into a closure's path with http.path",
    );
    expect(upstream.received).toEqual([]);
  });

  it("is refused when the path is an absolute URL, as a relative one is", async () => {
    const api = defineApi({
      name: "files",
      baseURL: `${upstream.url}/echo`,
      endpoints: {
        file: endpoint
          .variables<{ name: string }>()
          .via((http, { name }) => http.get(`${upstream.url}/echo/files/${name}`, undefined)),
      },
    });

    const error = await createCaller(api)
      .file({ name: "a#b" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(400);
    expect(upstream.received).toEqual([]);
  });

  it("is refused for a remote stream as its parameters are", () => {
    const feed = stream
      .variables<{ room: string }>()
      .via((sse, { room }) => sse.get(`rooms/${room}`, undefined));

    expect(() => addressCall(feed, "feed", { room: "a#b" })).toThrow(RealtimeValidationError);
  });
});
