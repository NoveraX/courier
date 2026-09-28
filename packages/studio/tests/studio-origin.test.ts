/**
 * Who may talk to Studio, over its API and its sockets.
 *
 * Studio answered its own UI only at the literal bind host or `localhost`, so
 * the page opened at `127.0.0.1` or at a network address had every write
 * refused; and its sockets answered any page at all.
 */
import { describe, expect, it } from "vitest";

import { createStudioOriginPolicy } from "../src/server/studio-origin";

const policy = createStudioOriginPolicy({
  bindHost: "localhost",
  extraOrigins: ["http://localhost:4382"],
});

describe("the Studio UI", () => {
  it("is Studio's own page at whatever local address it was opened", () => {
    expect(policy.isUiCaller("http://localhost:6280", "localhost:6280")).toBe(true);
    expect(policy.isUiCaller("http://127.0.0.1:6280", "127.0.0.1:6280")).toBe(true);
    expect(policy.isUiCaller("http://[::1]:6280", "[::1]:6280")).toBe(true);
    expect(policy.isUiCaller("http://192.168.0.42:6280", "192.168.0.42:6280")).toBe(true);
  });

  it("is not a page whose origin differs from the address it called", () => {
    expect(policy.isUiCaller("http://localhost:5173", "localhost:6280")).toBe(false);
    expect(policy.isUiCaller("https://evil.example", "localhost:6280")).toBe(false);
    expect(policy.isUiCaller("null", "localhost:6280")).toBe(false);
  });

  it("is not a rebound domain, even one that names the address it called", () => {
    /* DNS rebinding points evil.example at 127.0.0.1; the page's origin and
       the Host it sends then agree, but name a domain Studio never bound. */
    expect(policy.isUiCaller("http://evil.example:6280", "evil.example:6280")).toBe(false);
  });

  it("is the host Studio was told to bind, by name", () => {
    const named = createStudioOriginPolicy({ bindHost: "studio.lan", extraOrigins: [] });

    expect(named.isUiCaller("http://studio.lan:6280", "studio.lan:6280")).toBe(true);
  });

  it("is an origin listed as one", () => {
    expect(policy.isUiCaller("http://localhost:4382", "localhost:6280")).toBe(true);
  });

  it("is a caller that is not a page", () => {
    expect(policy.isUiCaller(undefined, "localhost:6280")).toBe(true);
    expect(policy.isUiCaller(undefined, "127.0.0.1:6280")).toBe(true);
    expect(policy.isUiCaller(undefined, undefined)).toBe(true);
  });

  it("is not a caller without an Origin that sent a Host DNS could rebind", () => {
    /* What a rebound page's same-origin GET looks like. */
    expect(policy.isUiCaller(undefined, "evil.example:6280")).toBe(false);
  });
});

describe("a runtime", () => {
  it("is an app page served from this machine", () => {
    expect(policy.isRuntimeCaller("http://localhost:5173", "localhost:6280")).toBe(true);
    expect(policy.isRuntimeCaller("http://127.0.0.1:3000", "localhost:6280")).toBe(true);
    expect(policy.isRuntimeCaller("http://app.localhost:3000", "localhost:6280")).toBe(true);
  });

  it("is not a page on another site", () => {
    expect(policy.isRuntimeCaller("https://evil.example", "localhost:6280")).toBe(false);
    expect(policy.isRuntimeCaller("http://192.168.0.7:3000", "localhost:6280")).toBe(false);
  });

  it("is a process that is not a page, whatever name it reached Studio by", () => {
    expect(policy.isRuntimeCaller(undefined, "localhost:6280")).toBe(true);
    expect(policy.isRuntimeCaller(undefined, "host.docker.internal:6280")).toBe(true);
  });

  it("is not a page on a domain rebound to this machine", () => {
    expect(policy.isRuntimeCaller("http://evil.example:6280", "evil.example:6280")).toBe(false);
  });
});
