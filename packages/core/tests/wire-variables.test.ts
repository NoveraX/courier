/**
 * Variables of a GET proxy call travel as one JSON document, so their types
 * survive the hop from the browser to the handler.
 */
import { describe, expect, it } from "vitest";

import { encodeWireVariables, parseWireVariables } from "../src/utils/wire-variables";

describe("variables sent to the proxy", () => {
  it("survive the round trip with their types", () => {
    const variables = { page: 2, active: false, ids: [1, 2], filter: { role: "admin" } };
    const decoded = parseWireVariables(encodeWireVariables(variables) ?? null);

    expect(decoded).toEqual({ ok: true, variables });
  });

  it("send nothing when every value is undefined", () => {
    expect(encodeWireVariables({ a: undefined })).toBeUndefined();
  });

  it("are refused when the document is not an object", () => {
    expect(parseWireVariables("[1]")).toEqual({
      ok: false,
      reason: "variables must be a JSON object",
    });
    expect(parseWireVariables("{x")).toEqual({ ok: false, reason: "variables are not valid JSON" });
  });
});
