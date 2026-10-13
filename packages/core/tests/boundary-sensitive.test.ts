/**
 * A boundary's `sensitive` list against the API it is held by. The browser
 * reads the boundary and never the definition, so a read whose definition
 * sets `sensitiveVariables` and is left off the list would go out as GET,
 * which the proxy refuses with 405 on every call. The API is refused where
 * it is defined instead, saying which read to list; and a read listed there
 * that sends its variables in the address is refused too.
 */
import { describe, expect, it } from "vitest";

import { courier, defineApi, defineBoundary, defineGroup } from "../src/define/index";
import { ConfigurationError } from "../src/errors/configuration-error";

const { endpoint } = courier();

const groups = {
  users: defineGroup({
    prefix: "users",
    endpoints: {
      search: endpoint.get("search").variables<{ q: string }>(),
      byEmail: endpoint
        .get("by-email", { sensitiveVariables: true })
        .variables<{ email: string }>(),
    },
  }),
  billing: defineGroup({
    prefix: "billing",
    groups: {
      invoices: defineGroup({
        prefix: "invoices",
        endpoints: {
          lookup: endpoint
            .get("lookup", { sensitiveVariables: true })
            .variables<{ iban: string }>(),
        },
      }),
    },
  }),
};

function defineWith(boundary: ReturnType<typeof defineBoundary>) {
  return () =>
    defineApi({ name: "api", baseURL: "https://api.example", groups, boundary: boundary as never });
}

describe("a boundary held by an API", () => {
  it("is taken when its sensitive list names the reads that keep their variables out", () => {
    const boundary = defineBoundary({
      source: "api",
      expose: {
        "users.search": "query",
        "users.byEmail": "query",
        "billing.invoices.lookup": "query",
      },
      sensitive: ["users.byEmail", "billing.invoices.lookup"],
    });

    expect(defineWith(boundary)).not.toThrow();
  });

  it("is refused when it leaves out such a read, naming the read to list", () => {
    const boundary = defineBoundary({
      source: "api",
      expose: { "users.search": "query", "users.byEmail": "query" },
      sensitive: ["users.search"],
    });

    expect(defineWith(boundary)).toThrow(ConfigurationError);
    expect(defineWith(boundary)).toThrow(
      /"users\.byEmail".*Add "users\.byEmail" to the boundary's sensitive list/,
    );
  });

  it("is refused when it lists a read that sends its variables in the address", () => {
    const boundary = defineBoundary({
      source: "api",
      expose: { "users.search": "query" },
      sensitive: ["users.search"],
    });

    expect(defineWith(boundary)).toThrow(
      /lists "users\.search" in sensitive.*set sensitiveVariables/,
    );
  });

  it("is refused when it lists a read in a group inside another and leaves it out", () => {
    const boundary = defineBoundary({
      source: "api",
      expose: { "billing.invoices.lookup": "query" },
    });

    expect(defineWith(boundary)).toThrow(/"billing\.invoices\.lookup"/);
  });

  it("is refused when its sensitive list names what it does not expose", () => {
    const boundary = {
      ...defineBoundary({ source: "api", expose: { "users.search": "query" } }),
      sensitive: ["users.byEmail"],
    };

    expect(defineWith(boundary)).toThrow(/lists "users\.byEmail" in sensitive without exposing it/);
  });

  it("is refused with a code a deploy script can test for", () => {
    const boundary = defineBoundary({ source: "api", expose: { "users.byEmail": "query" } });

    expect(defineWith(boundary)).toThrow(expect.objectContaining({ code: "BOUNDARY_MISMATCH" }));
  });
});
