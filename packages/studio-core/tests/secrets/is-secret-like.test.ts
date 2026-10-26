/**
 * Whether a word reads as a credential rather than as prose or as a name
 * in code: long, or mixing digits into letters, case inside the word, or
 * the symbols keys and base64 carry.
 */
import { describe, expect, it } from "vitest";

import { isSecretLike } from "../../src/secrets/is-secret-like";
import { REDACTED } from "../../src/secrets/redacted";

describe("a word", () => {
  it("reads as a credential with digits among letters, case inside it, a key's symbols, or at length", () => {
    for (const word of [
      "B34rer",
      "hunter2",
      "dXNlcjpwYXNz",
      "abc+def/gh",
      "abcdefghijklmnopqrstuvwxyz",
    ]) {
      expect(isSecretLike(word), word).toBe(true);
    }
  });

  it("reads as prose or a name in code otherwise, and when shorter than asked", () => {
    for (const word of ["expired", "authentication", "createdAt", "ConnectionRefused", "abc12"]) {
      expect(isSecretLike(word), word).toBe(false);
    }
    expect(isSecretLike("hunter2", 8)).toBe(false);
  });

  it("is not cut twice", () => {
    expect(isSecretLike(REDACTED)).toBe(false);
  });
});
