/**
 * The routes of an API, read off its definition by the rules the proxy
 * applies: every endpoint it serves to a browser and how each is reached —
 * a read as GET only when it may be cached and its variables may sit in an
 * address — and nothing it refuses.
 */
import { describe, expect, it } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";

const { endpoint, stream, channel } = courier();

describe("routesOf", () => {
  it("names each endpoint by its path, in path order, with how the browser reaches it", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            list: endpoint.get("").response<string[]>().cache({ revalidate: 60 }),
            search: endpoint.get("search").variables<{ q: string }>(),
            byEmail: endpoint
              .get("by-email", { sensitiveVariables: true })
              .variables<{ email: string }>()
              .cache({ revalidate: 60 }),
            create: endpoint.post("").variables<{ name: string }>(),
          },
        }),
        live: defineGroup({
          prefix: "live",
          endpoints: {
            feed: stream.get("feed").response<string>(),
            presence: channel.connect("presence").response<string>(),
            chat: channel.connect("chat").response<string>().send<{ text: string }>(),
          },
        }),
      },
    });

    expect(routesOf(api, "api")).toEqual({
      source: "api",
      endpoints: {
        "live.chat": { transport: "ws", bidirectional: true },
        "live.feed": { transport: "sse" },
        "live.presence": { transport: "ws" },
        "users.byEmail": { type: "query" },
        "users.create": { type: "mutation" },
        "users.list": { type: "query", get: true },
        "users.search": { type: "query" },
      },
    });
    expect(Object.keys(routesOf(api, "api").endpoints)).toEqual([
      "live.chat",
      "live.feed",
      "live.presence",
      "users.byEmail",
      "users.create",
      "users.list",
      "users.search",
    ]);
  });

  it("leaves out every endpoint the proxy refuses, the nearest mark deciding", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      expose: false,
      groups: {
        posts: defineGroup({
          prefix: "posts",
          expose: true,
          endpoints: {
            list: endpoint.get(""),
            drafts: endpoint.get("drafts").expose(false),
          },
        }),
        admin: defineGroup({
          prefix: "admin",
          endpoints: {
            purge: endpoint.post("purge"),
            health: endpoint.get("health").expose(),
          },
        }),
      },
    });

    expect(Object.keys(routesOf(api, "api").endpoints)).toEqual(["admin.health", "posts.list"]);
  });

  it("names an endpoint of a group inside a group by its whole path", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      groups: {
        billing: defineGroup({
          prefix: "billing",
          groups: {
            invoices: defineGroup({
              prefix: "invoices",
              endpoints: { list: endpoint.get("") },
            }),
          },
        }),
      },
    });

    expect(routesOf(api, "api").endpoints).toEqual({
      "billing.invoices.list": { type: "query" },
    });
  });

  it("carries the API's own say on cancelling and sharing reads, for its browser client", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      cancelPrevious: ["search"],
      coalesce: false,
      endpoints: { search: endpoint.get("search").variables<{ q: string }>() },
    });

    expect(routesOf(api, "api")).toMatchObject({ cancelPrevious: ["search"], coalesce: false });
  });
});
