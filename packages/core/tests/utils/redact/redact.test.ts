/**
 * One function cuts every credential out of what leaves the process: a text,
 * a set of headers, an error with its chain of causes, and data of any
 * shape — and never changes the value it was given.
 */
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";

import { HTTPError } from "../../../src/errors";
import { redact } from "../../../src/utils/redact";

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SECRET = ["Zq9x7", "Kp2Lm", "4Nw8"].join("");

/** A seeded generator, so a run that fails can be run again exactly. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("redact a text", () => {
  it("cuts the value the platform quoted as it refused a header", () => {
    const text = `Headers.set: "Bearer ${SECRET}\r\nX-Injected: 1" is an invalid header value.`;

    expect(redact(text)).toBe('Headers.set: "[redacted]" is an invalid header value.');
  });

  it("cuts a credential in an address and in a pair", () => {
    const text = `GET https://ana:${SECRET}@api.test/v1?api_key=${SECRET} failed, password=${SECRET}`;

    expect(redact(text)).toBe(
      "GET https://api.test/v1?api_key=[redacted] failed, password=[redacted]",
    );
  });

  it("leaves prose as it was", () => {
    expect(redact("connect ECONNREFUSED 127.0.0.1:5432")).toBe(
      "connect ECONNREFUSED 127.0.0.1:5432",
    );
  });

  it("never lets a credential through, whatever text surrounds it", () => {
    const random = generator(20_261_105);
    const words = ["fetch", "failed", "at", "line", "user", "ana", ":", ",", "(", ")", "=", "42"];
    const forms = [
      `Authorization: Bearer ${SECRET}`,
      `Bearer ${SECRET}`,
      `password=${SECRET}`,
      `"token": "${SECRET}"`,
      `https://ana:${SECRET}@db.internal:5432/app`,
      `https://api.test/v1?access_token=${SECRET}`,
      `x-api-key=${SECRET}`,
    ];
    for (let run = 0; run < 1_000; run++) {
      const around = (): string =>
        Array.from(
          { length: Math.floor(random() * 400) },
          () => words[Math.floor(random() * words.length)],
        ).join(" ");
      const form = forms[Math.floor(random() * forms.length)];
      const text = `${around()} ${form} ${around()}`;

      expect(redact(text), text).not.toContain(SECRET);
    }
  });
});

describe("redact headers", () => {
  it("hides every credential's value by its name and keeps the rest", () => {
    const headers = new Headers({
      authorization: `Bearer ${SECRET}`,
      cookie: `sid=${SECRET}`,
      "x-api-key": SECRET,
      accept: "application/json",
    });

    expect(redact(headers)).toEqual({
      authorization: "Bearer [redacted]",
      cookie: "[redacted]",
      "x-api-key": "[redacted]",
      accept: "application/json",
    });
  });
});

describe("redact an error", () => {
  it("copies it with its message, its stack's message and its fields cut, and its frames kept", () => {
    const error = Object.assign(new TypeError(`refused with token=${SECRET}`), {
      code: "E_REFUSED",
      apiKey: SECRET,
    });

    const copy = redact(error);

    expect(copy).not.toBe(error);
    expect(copy.name).toBe("TypeError");
    expect(copy.message).toBe("refused with token=[redacted]");
    expect(copy).toMatchObject({ code: "E_REFUSED", apiKey: "[redacted]" });
    expect(copy.stack?.split("\n").slice(1)).toEqual(error.stack?.split("\n").slice(1));
    expect(inspect(copy)).not.toContain(SECRET);
    expect(error.message).toContain(SECRET);
  });

  it("cuts every cause in its chain, and an AggregateError's errors", () => {
    const refused = new AggregateError([new Error(`password=${SECRET}`)], "");
    const error = new Error("request failed", {
      cause: new TypeError("fetch failed", { cause: refused }),
    });

    const copy = redact(error);

    expect(inspect(copy, { depth: 10 })).not.toContain(SECRET);
    const aggregate = (copy.cause as Error).cause;
    expect(aggregate).toBeInstanceOf(AggregateError);
    expect((aggregate as AggregateError).errors).toMatchObject([
      { message: "password=[redacted]" },
    ]);
  });

  it("prints an HTTPError's headers and body without their credentials", () => {
    const error = new HTTPError({
      status: 401,
      headers: new Headers({ "set-cookie": `sid=${SECRET}; Path=/`, "x-request-id": "r1" }),
      data: { message: "expired", refreshToken: SECRET },
    });

    const copy = redact(error);

    expect(copy).toMatchObject({
      status: 401,
      headers: { "set-cookie": ["sid=[redacted]; Path=/"], "x-request-id": "r1" },
      data: { message: "expired", refreshToken: "[redacted]" },
    });
  });

  it("ends a chain that loops where it repeats", () => {
    const first = new Error("first");
    Object.defineProperty(first, "cause", { value: new Error("second", { cause: first }) });

    const copy = redact(first);

    expect((copy.cause as Error).cause).toBe("[…]");
  });

  it("gives a field named __proto__ to the copy, not to its prototype", () => {
    const error = new Error("odd");
    Object.defineProperty(error, "__proto__", { value: "own", enumerable: true });

    const copy = redact(error);

    expect(Object.getOwnPropertyDescriptor(copy, "__proto__")?.value).toBe("own");
    expect(copy).toBeInstanceOf(Error);
  });
});

describe("redact data", () => {
  it("hides an entry a strong name holds whatever it is, and a weak one only when it reads as a key", () => {
    const value = {
      user: "ana",
      credentials: { user: "ana", pass: SECRET },
      key: "id",
      session: SECRET,
      list: [{ password: SECRET }, `Bearer ${SECRET}`],
    };

    expect(redact(value)).toEqual({
      user: "ana",
      credentials: "[redacted]",
      key: "id",
      session: "[redacted]",
      list: [{ password: "[redacted]" }, "Bearer [redacted]"],
    });
  });

  it("is bounded: a value deeper than sixteen levels, or one that holds itself, is cut", () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let level = 0; level < 20; level++) deep = { next: deep };
    const looping: Record<string, unknown> = { name: "loop" };
    looping.self = looping;

    expect(JSON.stringify(redact(deep))).toContain('"[…]"');
    expect(redact(looping)).toEqual({ name: "loop", self: "[…]" });
  });

  it("keeps a thousand entries of a list and says how many more there were", () => {
    const shown = redact(Array.from({ length: 1_005 }, (_, index) => index)) as unknown[];

    expect(shown).toHaveLength(1_001);
    expect(shown.at(-1)).toBe("[… 5 more]");
  });

  it("shows another object by its kind alone, an address cut and a date as it is", () => {
    const at = new Date(0);

    expect(redact(new Map([["token", SECRET]]))).toBe("[object Map]");
    expect(redact(new URL(`https://api.test/?token=${SECRET}`))).toBe(
      "https://api.test/?token=[redacted]",
    );
    expect(redact(at)).toBe(at);
  });
});
