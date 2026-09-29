import { describe, expect, it } from "vitest";
import { isSafeHttpOrigin } from "../src/lib/is-safe-http-origin";

describe("isSafeHttpOrigin", () => {
  describe("accepts http(s) origins", () => {
    it.each([
      "http://localhost:3000",
      "https://example.com",
      "http://127.0.0.1:8080/",
      "https://api.example.com/path",
      "HTTP://EXAMPLE.COM",
    ])("accepts %s", (origin) => {
      expect(isSafeHttpOrigin(origin)).toBe(true);
    });
  });

  describe("rejects dangerous schemes", () => {
    it.each([
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "blob:https://example.com/abc",
      "about:blank",
      "ws://example.com",
      "wss://example.com",
      "ftp://example.com",
    ])("rejects %s", (origin) => {
      expect(isSafeHttpOrigin(origin)).toBe(false);
    });
  });

  describe("rejects malformed input", () => {
    it.each(["", "not a url", "://broken", "//missing-scheme.com", "/relative/path", "http://"])(
      "rejects %s",
      (value) => {
        expect(isSafeHttpOrigin(value)).toBe(false);
      },
    );
  });

  describe("rejects non-string input", () => {
    it.each([null, undefined, 42, true, {}, [], Symbol("x")])("rejects %p", (value) => {
      expect(isSafeHttpOrigin(value)).toBe(false);
    });
  });
});
