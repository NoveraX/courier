/**
 * A call sent with its endpoint's idempotency key, in Studio: kept from its
 * event and from a saved session, and listed in the Overview with where it
 * stands among the calls sent with the same key.
 */
import { describe, expect, it } from "vitest";

import { requestProperties } from "@/features/requests/request-properties";
import { requestFromSaved } from "@/features/sessions/saved-request";
import { requestFromStart } from "@/store/handle-request-events";
import { requestEntry } from "./request-entry-fixture";

const start = {
  id: "r1",
  type: "request:start",
  source: "shop",
  group: "orders",
  method: "place",
  mode: "direct",
  middlewareCount: 1,
  timestamp: 1,
  idempotencyKey: "4f1c-key",
};

describe("a call sent with an idempotency key", () => {
  it("keeps its key from its event and from a saved session", () => {
    expect(requestFromStart(start).idempotencyKey).toBe("4f1c-key");
    expect(requestFromSaved({ ...start, startedAt: 1 })?.idempotencyKey).toBe("4f1c-key");
    expect(
      requestFromStart({ ...start, idempotencyKey: undefined }).idempotencyKey,
    ).toBeUndefined();
  });

  it("is listed with its key, and the call it is among those sent with it", () => {
    const keyed = requestEntry({ idempotencyKey: "4f1c-key" });
    const property = (attempt?: { at: number; of: number }) =>
      requestProperties(keyed, { attempt }).find((p) => p.label === "Idempotency key")?.value;

    expect(property({ at: 2, of: 3 })).toBe("4f1c-key · call 2 of 3");
    expect(property({ at: 1, of: 1 })).toBe("4f1c-key");
    expect(requestProperties(requestEntry({}), {}).map((p) => p.label)).not.toContain(
      "Idempotency key",
    );
  });
});
