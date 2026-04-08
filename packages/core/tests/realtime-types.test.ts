import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { endpoint } from "../src/define/endpoint";
import { tracked } from "../src/realtime/types";
import type { SchemaMetadata } from "../src/validation";
import { ENDPOINT_SCHEMA } from "../src/validation";

/** Helper to read metadata from an endpoint function */
function getMeta(ep: unknown): SchemaMetadata | undefined {
  return (ep as Record<symbol, SchemaMetadata>)[ENDPOINT_SCHEMA];
}

/** Minimal Standard Schema for testing */
const fakeSchema: StandardSchemaV1 = {
  "~standard": {
    vendor: "test",
    version: 1,
    validate: (v: unknown) => ({ value: v }),
  },
};

// ---- tracked() helper ----

describe("tracked", () => {
  it("creates an SSEEvent with id and data", () => {
    const event = tracked("evt-1", { text: "hello" });

    expect(event).toEqual({ id: "evt-1", data: { text: "hello" } });
  });

  it("preserves complex data types", () => {
    const data = { users: [{ id: 1 }], cursor: "abc" };
    const event = tracked("cursor-abc", data);

    expect(event.id).toBe("cursor-abc");
    expect(event.data).toBe(data);
  });
});

// ---- endpoint() with transport metadata ----

describe("endpoint with transport", () => {
  it("attaches transport: sse to metadata", () => {
    const ep = endpoint<string>({ transport: "sse" })(async function* () {
      yield { data: "test" };
    });
    const meta = getMeta(ep);

    expect(meta).toBeDefined();
    expect(meta!.transport).toBe("sse");
  });

  it("attaches transport: ws to metadata (push-only)", () => {
    const ep = endpoint<string>({ transport: "ws" })(async function* () {
      yield "price-update";
    });
    const meta = getMeta(ep);

    expect(meta).toBeDefined();
    expect(meta!.transport).toBe("ws");
  });

  it("attaches transport: ws with receive schema to metadata", () => {
    const ep = endpoint<string>({ transport: "ws", receive: fakeSchema })(
      () => ({ onMessage: () => {} }),
    );
    const meta = getMeta(ep);

    expect(meta).toBeDefined();
    expect(meta!.transport).toBe("ws");
    expect(meta!.receive).toBe(fakeSchema);
  });

  it("preserves existing options alongside transport", () => {
    const ep = endpoint<string>({
      transport: "sse",
      type: "query",
      cache: { revalidate: 60 },
    })(async function* () {
      yield { data: "test" };
    });
    const meta = getMeta(ep);

    expect(meta).toBeDefined();
    expect(meta!.transport).toBe("sse");
    expect(meta!.type).toBe("query");
    expect(meta!.cache).toEqual({ revalidate: 60 });
  });

  it("HTTP endpoints still work without transport field", () => {
    const ep = endpoint<string[]>({ type: "query" })((http) => http.get());
    const meta = getMeta(ep);

    expect(meta).toBeDefined();
    expect(meta!.transport).toBeUndefined();
    expect(meta!.type).toBe("query");
  });

  it("endpoint without config attaches no metadata", () => {
    const ep = endpoint<string>()((http) => http.get());
    const meta = getMeta(ep);

    expect(meta).toBeUndefined();
  });
});
