/**
 * An `allowedOrigins` entry a browser can never send — a trailing slash, a
 * path, the scheme's default port, no scheme — matched nothing, so the page
 * it was written for was refused and nothing said why. Such entries are now
 * refused when the handler is created, naming the form a browser sends.
 */
import { describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter/create-handler";
import { createWSHandler } from "../src/adapter/handle-ws";
import { ConfigurationError } from "../src/errors";

function refusal(allowedOrigins: string[]): ConfigurationError | undefined {
  try {
    createHandler({ allowedOrigins });
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  return undefined;
}

describe("an allowedOrigins entry no browser can send", () => {
  it.each([
    ["https://app.example.com/", "https://app.example.com"],
    ["https://app.example.com/admin", "https://app.example.com"],
    ["https://app.example.com:443", "https://app.example.com"],
    ["http://app.example.com:80", "http://app.example.com"],
    [" https://app.example.com", "https://app.example.com"],
    ["https://bücher.example", "https://xn--bcher-kva.example"],
  ])("refuses %j, naming %j", (entry, sent) => {
    const error = refusal([entry]);

    expect(error?.code).toBe("INVALID_ALLOWED_ORIGIN");
    expect(error?.message).toContain(`"${sent}"`);
  });

  it.each([
    "app.example.com",
    "localhost:3000",
    "*",
    "*.example.com/",
    "https://*.example.com/api",
    "chrome-extension://abcdef/",
  ])("refuses %j", (entry) => {
    expect(refusal([entry])?.code).toBe("INVALID_ALLOWED_ORIGIN");
  });

  it("refuses null, which every sandboxed frame sends", () => {
    expect(refusal(["null"])?.message).toContain("sandboxed");
  });

  it("is refused by the WebSocket handler too", () => {
    expect(() => createWSHandler({ allowedOrigins: ["https://app.example.com/"] })).toThrow(
      /can never match/,
    );
  });
});

describe("an allowedOrigins entry a browser sends", () => {
  it("is accepted", () => {
    const entries = [
      "https://app.example.com",
      "https://App.Example.com",
      "http://localhost:5173",
      "http://[::1]:3000",
      "https://*.example.com",
      "*.example.com",
      "*.example.com:8443",
      "chrome-extension://abcdef",
    ];

    expect(refusal(entries)).toBeUndefined();
    expect(() => createWSHandler({ allowedOrigins: entries })).not.toThrow();
  });
});
