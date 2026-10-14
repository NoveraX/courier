/**
 * An endpoint's definition in the Explorer says whether a page may call it
 * through the proxy, and the mark that decided, as the source scan reports
 * it — and says nothing of pages for an endpoint the config does not declare.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { explorerModelOf } from "@/features/explorer/explorer-model";
import { EndpointDefinition } from "@/screens/explorer/endpoint-definition";
import type { Catalog, CatalogEndpoint } from "@/store/types";

const NOW = 1_000_000;

function catalogWith(page: CatalogEndpoint["page"]): Catalog {
  const list: CatalogEndpoint = {
    type: "query",
    hasVariablesSchema: false,
    hasResponseSchema: true,
    origin: "scan",
    path: "",
    ...(page && { page }),
  };
  return {
    api: {
      baseURL: "https://api.example.com",
      groups: { orders: { prefix: "orders", endpoints: { list } } },
    },
  };
}

function definitionOf(page: CatalogEndpoint["page"], onTryAsServer?: () => void): string {
  const [endpoint] = explorerModelOf(catalogWith(page), [], NOW, 500).endpoints;
  if (!endpoint) throw new Error("The catalog has no endpoint");
  return renderToStaticMarkup(
    <EndpointDefinition endpoint={endpoint} now={NOW} onTryAsServer={onTryAsServer} />,
  );
}

describe("an endpoint's definition", () => {
  it("says a page may call it, and the mark that opens it", () => {
    const html = definitionOf({ exposed: true, reason: "expose: true on orders" });

    expect(html).toContain("Pages");
    expect(html).toContain("exposed");
    expect(html).toContain("expose: true on orders");
  });

  it("says it is kept to the server, and why", () => {
    const html = definitionOf({ exposed: false, reason: "nothing marks it .expose()" });

    expect(html).toContain("kept to the server");
    expect(html).toContain("nothing marks it .expose()");
  });

  it("offers to try one kept to the server as server code, and only that one", () => {
    const tryIt = () => undefined;

    expect(definitionOf({ exposed: false, reason: "nothing marks it .expose()" }, tryIt)).toContain(
      "Try as server code",
    );
    expect(definitionOf({ exposed: true, reason: "marked .expose()" }, tryIt)).not.toContain(
      "Try as server code",
    );
  });

  it("has no Pages row for an endpoint the config does not declare", () => {
    expect(definitionOf(undefined)).not.toContain("Pages");
  });
});
