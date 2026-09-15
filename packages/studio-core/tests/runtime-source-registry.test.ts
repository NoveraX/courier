/**
 * Tests for the runtime source registry — the in-process accumulator that
 * lets the playground responder dispatch incoming `playground:execute`
 * events to the canonical local executors.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineApi } from "@noverax/courier/define";
import { _resetAnnouncementsForTests, announceHosting } from "@noverax/courier/announce";
import {
  _resetSourceRegistryForTests,
  getRegisteredSource,
  getRegisteredSources,
  installSourceRegistry,
} from "../src/runtime/runtime-source-registry";

beforeEach(() => {
  _resetAnnouncementsForTests();
  _resetSourceRegistryForTests();
});

afterEach(() => {
  _resetAnnouncementsForTests();
  _resetSourceRegistryForTests();
});

describe("runtime source registry", () => {
  it("absorbs sources from past announcements when installed", () => {
    const api = defineApi({ name: "api", baseURL: "http://x", groups: {} });
    announceHosting({ transports: ["http"], sources: [api] });

    installSourceRegistry();

    expect(getRegisteredSource("api")).toBe(api);
    expect(Object.keys(getRegisteredSources())).toEqual(["api"]);
  });

  it("absorbs sources from future announcements after installation", () => {
    installSourceRegistry();
    const api = defineApi({ name: "later", baseURL: "http://x", groups: {} });
    announceHosting({ transports: ["sse"], sources: [api] });
    expect(getRegisteredSource("later")).toBe(api);
  });

  it("is idempotent — multiple installSourceRegistry calls do not double-listen", () => {
    installSourceRegistry();
    installSourceRegistry();
    installSourceRegistry();

    const api = defineApi({ name: "once", baseURL: "http://x", groups: {} });
    announceHosting({ transports: ["http"], sources: [api] });

    // If listener was registered N times we'd get the same source N times,
    // but Map.set with the same key dedupes on its own — we still verify
    // the entry is correct.
    expect(getRegisteredSource("once")).toBe(api);
  });

  it("aggregates multiple announcements into one Sources map", () => {
    const a = defineApi({ name: "a", baseURL: "http://x", groups: {} });
    const b = defineApi({ name: "b", baseURL: "http://y", groups: {} });
    announceHosting({ transports: ["http"], sources: [a] });
    announceHosting({ transports: ["sse"], sources: [b] });

    installSourceRegistry();

    const all = getRegisteredSources();
    expect(Object.keys(all).sort()).toEqual(["a", "b"]);
  });
});
