/**
 * The calls of newer browser APIs a module does not check for first: a
 * `typeof`, an optional chain onto the API or an optional call of it
 * counting as a check, a chain through the object it is called on not.
 */
import { describe, expect, it } from "vitest";

import { newerApiCalls } from "./newer-api-calls.mjs";

describe("newerApiCalls", () => {
  it("names a module that calls a newer API without checking for it", () => {
    const bundle = [
      "// packages/core/lib/session/other-site.js",
      "const api = URL.canParse(target, page) ? new URL(target, page) : void 0;",
      "// packages/core/lib/utils/parse-url.js",
      "function parseUrl(input, base) { try { return new URL(input, base); } catch { return void 0; } }",
    ].join("\n");

    expect(newerApiCalls(bundle)).toEqual([
      {
        module: "core/lib/session/other-site.js",
        api: "URL.canParse",
        lacking: "Safari 16, Chrome 119 and Firefox 114",
      },
    ]);
  });

  it("takes a typeof, an optional chain onto the API, or an optional call of it, for a check", () => {
    const bundle = [
      "// packages/core/lib/utils/timeout-signal.js",
      'if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);',
      "// packages/core/lib/utils/sha256-hex.js",
      'const digest = crypto?.subtle === void 0 ? sha256(bytes) : await crypto.subtle.digest("SHA-256", bytes);',
      "// packages/core/lib/utils/cookies.js",
      "const listed = headers.getSetCookie?.() ?? [];",
    ].join("\n");

    expect(newerApiCalls(bundle)).toEqual([]);
  });

  it("does not take a chain through the object an API is called on for a check", () => {
    const bundle = [
      "// packages/core/lib/utils/execute-response.js",
      'for (const cookie of upstream?.getSetCookie() ?? []) target.headers.append("set-cookie", cookie);',
    ].join("\n");

    expect(newerApiCalls(bundle).map((call) => call.api)).toEqual(["Headers.getSetCookie"]);
  });

  it("reads no comment as a call", () => {
    const bundle = [
      "// packages/core/lib/utils/any-signal.js",
      "/* AbortSignal.any does this where the runtime has it. */",
      "function anySignal(signals) { return combine(signals); }",
    ].join("\n");

    expect(newerApiCalls(bundle)).toEqual([]);
  });
});
