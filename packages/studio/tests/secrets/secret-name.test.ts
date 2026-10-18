/**
 * Whether a name says its value is a credential, read by its last word or
 * by the whole name run together: strong, whatever the value; weak, only
 * when the value reads as one; or not at all.
 */
import { describe, expect, it } from "vitest";

import { secretName } from "../../src/server/secrets/secret-name";

describe("a name", () => {
  it("is strong when its last word names a credential, in any case and joined any way", () => {
    for (const name of [
      "password",
      "x-api-key",
      "accessToken",
      "client_secret",
      "Authorization",
      "SECRET_KEY",
    ]) {
      expect(secretName(name), name).toBe("strong");
    }
  });

  it("is strong run together, as a session cookie's and a double-submit token's are", () => {
    for (const name of [
      "JSESSIONID",
      "session_id",
      "PHPSESSID",
      "csrftoken",
      "refreshtoken",
      "privatekey",
      "csrf",
      "X-Hub-Signature-256",
    ]) {
      expect(secretName(name), name).toBe("strong");
    }
  });

  it("is weak when its last word names a credential only with a value that reads as one", () => {
    for (const name of ["key", "sort key", "session", "x-auth", "otp"]) {
      expect(secretName(name), name).toBe("weak");
    }
  });

  it("names no credential when the credential's word is not its last", () => {
    for (const name of [
      "keyFile",
      "tokenUrl",
      "secretName",
      "tokens",
      "passwordPolicy",
      "sessionCount",
    ]) {
      expect(secretName(name), name).toBeUndefined();
    }
  });
});
