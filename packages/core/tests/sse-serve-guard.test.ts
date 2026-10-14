import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveSSEEndpoint } from "../src/adapter/sse-resolve";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";

const EventSchema = z.object({ n: z.number() });
const { stream } = courier();

const api = defineApi({
  expose: true,
  name: "api",
  baseURL: "https://example.com",
  groups: {
    events: defineGroup({
      prefix: "/events",
      endpoints: {
        served: stream.response(EventSchema).implement(async function* () {
          yield { data: { n: 1 } };
        }),
        remote: stream.get("live").response(EventSchema),
      },
    }),
  },
});

describe("an SSE server resolves the streams it serves and relays", () => {
  it("resolves an endpoint implemented here", () => {
    const result = resolveSSEEndpoint({ api }, "api", "events", "served");

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { endpoint: unknown }).endpoint).toBeTypeOf("function");
  });

  it("resolves one another server serves as relayed, and one implemented here as not", () => {
    const remote = resolveSSEEndpoint({ api }, "api", "events", "remote");
    const served = resolveSSEEndpoint({ api }, "api", "events", "served");

    expect(remote).toMatchObject({ relayed: true, api });
    expect(served).toMatchObject({ relayed: false });
  });
});
