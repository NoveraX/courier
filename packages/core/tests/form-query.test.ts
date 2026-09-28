/**
 * Query values written as OpenAPI's parameter styles ask. The client writes
 * a query in the default style, `form` exploded, which spread Stripe's
 * `created: { gte }` into `gte=…`; its `deepObject` parameters need
 * `created[gte]=…` and `expand[0]=…`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, formQuery } from "../src/define";
import { startUpstream, type Upstream } from "./helpers/upstream";

const DEEP = { style: "deepObject", explode: true } as const;

describe("formQuery", () => {
  it("writes a deepObject field's properties and items in brackets", () => {
    const query = formQuery(
      { created: { gte: 1680000000, lt: 1690000000 }, expand: ["tax", "data.source"] },
      { created: DEEP, expand: DEEP },
    );

    expect(query).toEqual({
      "created[gte]": "1680000000",
      "created[lt]": "1690000000",
      "expand[0]": "tax",
      "expand[1]": "data.source",
    });
  });

  it("keeps OpenAPI's defaults for a field it is not told about: a list repeats, an object spreads", () => {
    const query = formQuery({ tag: ["a", "b"], range: { from: 1 }, limit: 3 });

    expect(query).toEqual({ tag: ["a", "b"], from: "1", limit: "3" });
  });

  it("joins a list that does not explode with its style's delimiter", () => {
    const query = formQuery(
      { ids: [1, 2], words: ["a", "b"], flags: ["x", "y"] },
      {
        ids: { style: "form", explode: false },
        words: { style: "spaceDelimited", explode: false },
        flags: { style: "pipeDelimited", explode: false },
      },
    );

    expect(query).toEqual({ ids: "1,2", words: "a b", flags: "x|y" });
  });

  it("leaves out a field that is undefined or null, and writes nothing for no fields", () => {
    expect(formQuery({ a: undefined, b: null, c: 0 }, { b: DEEP })).toEqual({ c: "0" });
    expect(formQuery(undefined, { b: DEEP })).toEqual({});
  });
});

describe("a read whose closure writes its query with formQuery", () => {
  let upstream: Upstream;

  beforeEach(async () => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
    });
  });

  afterEach(async () => {
    await upstream.close();
  });

  it("sends the bracketed names, and fills the path from the same variables", async () => {
    const { endpoint } = courier();
    const api = defineApi({
      name: "shop",
      baseURL: upstream.url,
      endpoints: {
        charges: endpoint
          .variables<{ customer: string; created?: { gte?: number }; expand?: string[] }>()
          .via((http, variables) =>
            http.get("customers/:customer/charges", formQuery(variables, { created: DEEP, expand: DEEP })),
          ),
      },
    });

    await createCaller(api).charges({ customer: "cus_1", created: { gte: 1680000000 }, expand: ["tax"] });

    const url = new URL(upstream.received[0]?.url ?? "", upstream.url);
    expect(url.pathname).toBe("/customers/cus_1/charges");
    expect([...url.searchParams]).toEqual([
      ["created[gte]", "1680000000"],
      ["expand[0]", "tax"],
    ]);
  });
});
