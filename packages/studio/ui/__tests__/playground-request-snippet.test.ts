/**
 * Copy as URL, cURL or fetch writes the request the Playground would send:
 * the endpoint's full address with its path filled, the variables a read
 * carries in its query string, and a write's method and body.
 */
import { describe, expect, it } from "vitest";

import { buildCurlSnippet, buildFetchSnippet } from "@/lib/snippets";
import { buildCatalog } from "@/store/build-catalog";
import type { EndpointInfo } from "@/store/types-ui";
import { endpointUrl, snippetInput } from "../src/views/playground/request-snippet";
import { API } from "./playground-fixtures";

const catalog = buildCatalog([API], []);

function copied(group: string, method: string, variables: unknown, headers: Record<string, string> = {}) {
  const source = catalog.api;
  const entry = source?.groups[group];
  const endpoint: EndpointInfo | undefined = entry?.endpoints[method];
  if (source === undefined || entry === undefined || endpoint === undefined) {
    throw new Error(`The fixture has no ${group}.${method}`);
  }
  const url = endpointUrl(source, entry.prefix, endpoint);
  return snippetInput(url, endpoint, { variables, headers });
}

describe("a copied request", () => {
  it("fills the path from the variables and keeps the host", () => {
    expect(copied("users", "byId", { id: 2 })).toEqual({
      url: "http://localhost:7501/users/2",
      method: "GET",
      headers: {},
    });
  });

  it("puts a read's other variables in the query string", () => {
    expect(copied("users", "search", { q: "ada lovelace", limit: 5 }).url).toBe(
      "http://localhost:7501/users/search?q=ada%20lovelace&limit=5",
    );
  });

  it("sends a write with its method and its variables as the body", () => {
    const input = copied("users", "create", { name: "Ada" }, { "x-client-tag": "pg" });

    expect(input).toEqual({
      url: "http://localhost:7501/users",
      method: "POST",
      headers: { "x-client-tag": "pg" },
      body: { name: "Ada" },
    });
    expect(buildCurlSnippet(input)).toBe(
      [
        "curl",
        "-X POST",
        "'http://localhost:7501/users'",
        "-H 'x-client-tag: pg'",
        "-H 'Content-Type: application/json'",
        `-d '{"name":"Ada"}'`,
      ].join(" \\\n  "),
    );
    expect(buildFetchSnippet(input)).toContain('method: "POST"');
  });

  it("sends a delete with no body, its id in the path", () => {
    expect(copied("users", "remove", { id: 9 })).toEqual({
      url: "http://localhost:7501/users/9",
      method: "DELETE",
      headers: {},
    });
  });

  it("addresses a group by its prefix, not its name", () => {
    expect(copied("misc", "headers", undefined).url).toBe("http://localhost:7501/v2/misc/echo/headers");
  });

  it("gives no address for a stream, which the app serves", () => {
    const source = catalog.api;
    const ticks = source?.groups.live?.endpoints.ticks;
    if (source === undefined || ticks === undefined) throw new Error("The fixture has no live.ticks");
    expect(endpointUrl(source, "live", ticks)).toBe("");
  });
});
