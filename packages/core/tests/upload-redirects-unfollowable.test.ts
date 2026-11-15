/**
 * An upload whose redirects are followed by hand, a form's, read again for
 * each hop. A redirect it cannot follow — one more than 20 hops in, or to an
 * address whose scheme is not HTTP's — fails it as a network error does,
 * once, whatever its retry policy: the upstream would answer it the same
 * way again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { NetworkError } from "../src/errors";
import { retryMiddleware } from "../src/middleware/index";
import { startUpstream, type Upstream } from "./helpers/upstream";

/* The runtime's fetch copying this, and each fetch a test sends with taken for it. */
vi.mock("../src/utils/fetch-copies", () => {
  const copies = { forms: true, streams: false };
  return { FETCH_COPIES: copies, copiesOf: () => copies };
});

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

/* A caller whose policy repeats a write, as `mutations: true` asks: the upstream tells a repeated one apart. */
function uploader(baseURL: string): (variables: unknown) => Promise<unknown> {
  const { endpoint } = courier();
  const client = createCaller(
    defineApi({
      name: "api",
      baseURL,
      middleware: [retryMiddleware({ limit: 2, delay: 1, mutations: true })],
      endpoints: { upload: endpoint.post("start").variables<FormData>() },
    }),
  ) as unknown as { upload: (variables: unknown) => Promise<unknown> };
  return client.upload;
}

const form = (): FormData => {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(4000).fill(5)], "a.bin"));
  return body;
};

describe("an upload a redirect it cannot follow fails, under a policy that repeats it", () => {
  it("follows a loop to its twentieth hop, once", async () => {
    upstream = await startUpstream((request, res) => {
      res.writeHead(307, { location: request.url === "/start" ? "/again" : "/start" });
      res.end();
    });

    const failure = await uploader(upstream.url)(form()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NetworkError);
    expect(upstream.received).toHaveLength(21);
  });

  it("is sent once when the redirect leaves HTTP", async () => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(307, { location: "ftp://files.example.test/upload" });
      res.end();
    });

    const failure = await uploader(upstream.url)(form()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NetworkError);
    expect(upstream.received).toHaveLength(1);
  });
});
