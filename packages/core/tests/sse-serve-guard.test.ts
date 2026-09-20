import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveSSEEndpoint } from "../src/adapter/sse-resolve";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";

const EventSchema = z.object({ n: z.number() });
const { stream } = courier();

const api = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    events: defineGroup({
      prefix: "/events",
      endpoints: {
        served: stream.response(EventSchema).implement(async function* () {
          yield { data: { n: 1 } };
        }),
        remote: stream.response(EventSchema).via((sse) => sse.get("live")),
      },
    }),
  },
});

describe("an SSE server refuses what it cannot serve", () => {
  it("resolves an endpoint implemented here", () => {
    const result = resolveSSEEndpoint({ api }, "api", "events", "served");

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { endpoint: unknown }).endpoint).toBeTypeOf("function");
  });

  it("refuses one that only describes where to connect", async () => {
    const result = resolveSSEEndpoint({ api }, "api", "events", "remote");

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    await expect((result as Response).text()).resolves.toContain(".implement()");
  });
});
