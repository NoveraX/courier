/**
 * One name with one value is hidden in every place a record holds it, or in
 * none: a parameter of an address, absolute or a path's in a text, a call's
 * variables, a body written as JSON or as a form, a header. A strong name
 * hides whatever it is given, a one-time password and a session's id among
 * them; `key`, the one weak name, hides a value that reads as a credential,
 * a number as the digits it is written in.
 */
import { describe, expect, it } from "vitest";

import { redact } from "../../../src/utils/redact";
import { REDACTED } from "../../../src/utils/redact/redacted";

/* Names whose value is a credential, whatever it is. */
const STRONG = ["token", "password", "otp", "sid", "sig", "session", "auth"];
/* The name whose value is a credential only when it reads as one. */
const WEAK = ["key"];
/* Names that say nothing of their value. */
const PLAIN = ["page", "id"];

type Value = string | number;

/* A value of each kind a call gives a name, and whether it reads as a credential. */
const VALUES: readonly (readonly [kind: string, value: Value, readsAsCredential: boolean])[] = [
  ["a word", "made-up", false],
  ["a short code", "1234", false],
  ["a number of two digits", 42, false],
  ["six digits", "123456", true],
  ["a number of six digits", 123456, true],
  ["a random key", "Zq9x7Kp2Lm4Nv8Rt", true],
];

type Shown = "hidden" | "shown";

/* Whether a value read back stands as it was given or as the marker; anything else is shown as read. */
function readBack(read: unknown, value: Value): Shown | string {
  if (read === REDACTED) return "hidden";
  if (read === value || read === String(value)) return "shown";
  return `read back as ${JSON.stringify(read)}`;
}

/* The value a name has in a query or a form: what follows `name=` up to the next pair. */
function paramOf(text: string, name: string): string | undefined {
  return new RegExp(`(?:^|[?&])${name}=([^&#\\s]*)`).exec(text)?.[1];
}

/* Each place a record holds a name and its value, read back after redact. */
const PLACES: Readonly<Record<string, (name: string, value: Value) => Shown | string>> = {
  "an address": (name, value) =>
    readBack(paramOf(redact(`https://api.test/v1/users?${name}=${value}&limit=2`), name), value),
  "a path's query in a text": (name, value) =>
    readBack(paramOf(redact(`GET /v1/users?${name}=${value}&limit=2 failed`), name), value),
  "the variables": (name, value) => {
    const shown = redact({ [name]: value, limit: 2 }) as Record<string, unknown>;
    return readBack(shown[name], value);
  },
  "a body as JSON": (name, value) => {
    const shown = redact(JSON.stringify({ [name]: value, limit: 2 }));
    const read = new RegExp(`"${name}":("[^"]*"|[^,}]*)`).exec(shown)?.[1] ?? "";
    return readBack(read.startsWith('"') ? read.slice(1, -1) : read, value);
  },
  "a body as a form": (name, value) =>
    readBack(paramOf(redact(`${name}=${value}&limit=2`), name), value),
  "a header": (name, value) =>
    readBack(redact(new Headers({ [name]: String(value), accept: "*/*" }))[name], value),
};

/* How a name is expected to read a value, in every place alike. */
function expected(name: string, readsAsCredential: boolean): Shown {
  if (STRONG.includes(name)) return "hidden";
  return WEAK.includes(name) && readsAsCredential ? "hidden" : "shown";
}

describe("a name and its value, in every place a record holds them", () => {
  for (const name of [...STRONG, ...WEAK, ...PLAIN]) {
    it(`reads ${name} alike in each place, for each kind of value`, () => {
      const differing: string[] = [];
      for (const [kind, value, readsAsCredential] of VALUES) {
        const wanted = expected(name, readsAsCredential);
        for (const [place, read] of Object.entries(PLACES)) {
          const got = read(name, value);
          if (got !== wanted) differing.push(`${kind} in ${place}: ${got}, not ${wanted}`);
        }
      }

      expect(differing).toEqual([]);
    });
  }
});

describe("a call's attempt and its variables, in one record", () => {
  it("hide the same values", () => {
    const variables = {
      token: "made-up-var-token",
      password: "made-up-var-password",
      sig: "made-up-var-sig",
      page: 1,
    };
    const attempt = `https://api.test/users?${new URLSearchParams({ ...variables, page: "1" })}`;

    expect(redact({ attempt, variables })).toEqual({
      attempt: `https://api.test/users?token=${REDACTED}&password=${REDACTED}&sig=${REDACTED}&page=1`,
      variables: { token: REDACTED, password: REDACTED, sig: REDACTED, page: 1 },
    });
  });
});
