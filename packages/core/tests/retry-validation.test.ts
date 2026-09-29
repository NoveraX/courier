/**
 * A response that fails its schema is not retried.
 *
 * The response is validated inside the middleware chain, so a retry policy
 * saw the ValidationError and sent the request again — three more times for
 * the same answer, which fails the same way every time.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { retryMiddleware } from "../src/middleware/retry";
import { ValidationError } from "../src/validation";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((_request, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"id":"not-a-number"}');
  });
});

afterEach(async () => {
  await upstream.close();
});

describe("a retry policy and a response that fails validation", () => {
  it("rejects after one request", async () => {
    const client = createCaller(
      defineApi({
        name: "typed",
        baseURL: upstream.url,
        middleware: [retryMiddleware({ limit: 3, delay: 1 })],
        endpoints: { item: endpoint.get("item").response(z.object({ id: z.number() })) },
      }),
    );

    const error = await client.item().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(upstream.received).toHaveLength(1);
  });
});
