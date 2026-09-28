/**
 * A ReadableStream as a request body.
 *
 * Fetch refuses a streamed body unless the request says `duplex: "half"`,
 * and the client never said it: every such call failed with an HTTPError of
 * status 0 before a byte was sent — while the same call with upload
 * progress, which buffered the stream, went through.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ bytes: request.body.byteLength }));
  });
});

afterEach(async () => {
  await upstream.close();
});

describe("a ReadableStream body", () => {
  it("is streamed to the upstream", async () => {
    const client = createCaller(
      defineApi({
        name: "raw",
        baseURL: upstream.url,
        endpoints: {
          put: endpoint
            .variables<{ body: ReadableStream<Uint8Array> }>()
            .via((http, v) => http.post("raw", {}, { body: v.body })),
        },
      }),
    );
    const body = new Blob([new Uint8Array(100_000).fill(1)]).stream();

    const answer = await client.put({ body });

    expect(answer).toEqual({ bytes: 100_000 });
    expect(upstream.received[0]?.body.every((byte) => byte === 1)).toBe(true);
  });
});
