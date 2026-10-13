/**
 * A server caller's reads within one render, as React's `cache()` scopes
 * them: a page's `generateMetadata` and its body read the same thing once,
 * and a write in between makes the next read go out again.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { echo, startUpstream, type Upstream } from "../../core/tests/helpers/upstream";

/* One render: React's cache hands out the same value for the whole of it. */
vi.mock("react", () => ({
  cache: <TValue>(make: () => TValue) => {
    let made: TValue | undefined;
    return () => {
      made ??= make();
      return made;
    };
  },
}));

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

describe("createServerCaller within one render", () => {
  it("reads once what the page's metadata and its body both read, and anew after a write", async () => {
    const { createServerCaller } = await import("../src/server-caller");
    upstream = await startUpstream(echo);
    const site = createServerCaller(
      defineApi({
        name: "site",
        baseURL: upstream.url,
        endpoints: {
          seo: endpoint.get("seo").variables<{ page: string }>(),
          save: endpoint.post("seo").variables<{ page: string }>(),
        },
      }),
    );

    await site.seo({ page: "/" });
    await site.seo({ page: "/" });
    await site.save({ page: "/" });
    await site.seo({ page: "/" });

    expect(upstream.received.map(({ method }) => method)).toEqual(["GET", "POST", "GET"]);
  });
});
