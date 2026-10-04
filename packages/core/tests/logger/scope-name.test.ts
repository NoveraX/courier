/**
 * The scope a logger context prints as: lower case, words joined by hyphens.
 */
import { describe, expect, it } from "vitest";

import { scopeName } from "../../src/logger/scope-name";

describe("scopeName", () => {
  it("joins the words of a context with hyphens, an acronym kept whole", () => {
    expect(scopeName("Studio")).toBe("studio");
    expect(scopeName("MockServer")).toBe("mock-server");
    expect(scopeName("RedisPubSub")).toBe("redis-pub-sub");
    expect(scopeName("WS")).toBe("ws");
    expect(scopeName("MockWS")).toBe("mock-ws");
    expect(scopeName("HTTPClient")).toBe("http-client");
  });

  it("joins words written with spaces or underscores", () => {
    expect(scopeName("Mock users")).toBe("mock-users");
    expect(scopeName("payment_gateway")).toBe("payment-gateway");
  });

  it("names a context the same however many contexts came before it", () => {
    for (let index = 0; index < 300; index++) scopeName(`Made${index}Up`);

    expect(scopeName("Made299Up")).toBe("made299-up");
  });
});
