/**
 * The registry as a page's bundle has it: it reads no slot whatever lies on
 * the page's global object, keeps what a page's own code provides to
 * itself, and says why a call that needs a server's part found none.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import * as Browser from "../../../src/browser/capabilities/registry";
import type { SessionCapability } from "../../../src/capabilities/session";

const REGISTRY = Symbol.for("courier.serverCapabilities.v1");

afterEach(() => {
  Reflect.deleteProperty(globalThis, REGISTRY);
  vi.unstubAllGlobals();
});

describe("the registry in a page", () => {
  it("reads no slot a script put on the global object, beside the page's document", () => {
    vi.stubGlobal("document", { cookie: "" });
    const planted = { relayCookies: vi.fn() } as unknown as SessionCapability;
    Reflect.set(globalThis, REGISTRY, { session: planted });

    expect(Browser.serverCapability("session")).toBeUndefined();
  });

  it("keeps its slots to itself, off the global object", () => {
    Browser.capabilitySlots().session = {} as SessionCapability;

    expect(Reflect.get(globalThis, REGISTRY)).toBeUndefined();
    expect(Browser.serverCapability("session")).toBeUndefined();
  });

  it("says the code was built for a page, and what to do on a server", () => {
    expect(Browser.missingCapabilityCause()).toMatch(
      /^this code was built for a page, which serves no request: .* Jest's jsdom .* test it in a node environment$/,
    );
  });
});
