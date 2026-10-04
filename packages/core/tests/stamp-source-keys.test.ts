/**
 * Registering a source under a key.
 *
 * `registerSources` — behind the standalone server and attachRuntime —
 * refuses a key other than the name the author gave `defineApi`, as Studio
 * does, rather than renaming the source: the server would then answer only
 * the key, and a client calling by the name would get 400.
 */
import { describe, expect, it } from "vitest";

import { defineApi, getSourceName } from "../src/define";
import { registerSources } from "../src/sources";

describe("registerSources", () => {
  it("refuses a key that contradicts the name given to defineApi", () => {
    const billing = defineApi({
      name: "payments",
      baseURL: "https://billing.example",
      endpoints: {},
    });

    expect(() => registerSources({ api: billing })).toThrow(
      expect.objectContaining({ code: "SOURCE_KEY_MISMATCH" }),
    );
  });

  it("names a source by its key when defineApi chose the name itself", () => {
    const derived = defineApi({ baseURL: "https://jsonplaceholder.typicode.com", endpoints: {} });

    registerSources({ api: derived });

    expect(getSourceName(derived)).toBe("api");
  });

  it("accepts a chosen name registered under that same key", () => {
    const payments = defineApi({
      name: "payments",
      baseURL: "https://billing.example",
      endpoints: {},
    });

    expect(() => registerSources({ payments })).not.toThrow();
  });
});
