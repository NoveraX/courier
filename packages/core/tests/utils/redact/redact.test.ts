/**
 * One function cuts every credential out of what leaves the process: a text,
 * a set of headers, an error with its chain of causes, and data of any
 * shape — and never changes the value it was given.
 */
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";

import { HTTPError } from "../../../src/errors";
import { redact } from "../../../src/utils/redact";
import { REDACT_BOUNDS } from "../../../src/utils/redact/bounds";

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SECRET = ["Zq9x7", "Kp2Lm", "4Nw8"].join("");

/* The fastest of three runs: one the machine's load or a collection held up says nothing of the reading. */
const fastest = (run: () => void): number =>
  Math.min(
    ...[0, 1, 2].map(() => {
      const started = performance.now();
      run();
      return performance.now() - started;
    }),
  );

/* What V8 writes after an error's header, its name and message joined: its frames. */
const framesOf = (error: Error): string =>
  error.stack?.slice(`${error.name}: ${error.message}`.length) ?? "";

/* An error made `depth` calls down, its stack holding every frame: longer than a text is kept. */
function deepError(depth: number, make: () => Error): Error {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = depth + 50;
  try {
    const down = (left: number): Error => (left === 0 ? make() : down(left - 1));
    return down(depth);
  } finally {
    Error.stackTraceLimit = limit;
  }
}

/* Node's own error, its code in its header: `RangeError [ERR_ENCODING_NOT_SUPPORTED]: …`. */
function decoderError(label: string): Error {
  try {
    new TextDecoder(label);
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${label} was taken for an encoding`);
}

/* A class that names itself once its stack is taken, as most do. */
class Refused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refused";
  }
}

/* An error whose stack is written as source-map-support and Vite's module runner write one:
   `Error: ` for an error with no message, `Error: …` for one with no name. */
function headedAsSourceMaps(make: () => Error): Error {
  const prepare = Error.prepareStackTrace;
  Error.prepareStackTrace = (error: Error, frames: readonly unknown[]) =>
    `${error.name || "Error"}: ${error.message || ""}${frames.map((frame) => `\n    at ${frame}`).join("")}`;
  try {
    const error = make();
    void error.stack;
    return error;
  } finally {
    Error.prepareStackTrace = prepare;
  }
}

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

  it.each([
    ["line feeds", "\n"],
    ["line feeds and spaces", "\n "],
    ["CRLF", "\r\n"],
  ])("finds its frames in one pass, however long a run of %s its message holds", (_kind, unit) => {
    const error = new Error(`refused with token=${SECRET}${unit.repeat(65_536 / unit.length)}end`);

    const copy = redact(error);

    expect(framesOf(error)).toMatch(/^\n {4}at /);
    expect(copy.stack?.endsWith(framesOf(error))).toBe(true);
    expect(inspect(copy)).not.toContain(SECRET);
    expect(fastest(() => redact(error))).toBeLessThan(100);
  });

  it("takes a line for a frame only as V8 writes one, so a message's line starting with at is cut", () => {
    const error = new Error(`refused\n\nat once with token=${SECRET}`);

    const copy = redact(error);

    expect(copy.stack?.endsWith(framesOf(error))).toBe(true);
    expect(inspect(copy)).not.toContain(SECRET);
  });

  it("cuts a line of its message shaped like a frame, and keeps its frames as they are", () => {
    const error = new Error(`refused\n    at the gate with token=${SECRET}`);

    const copy = redact(error);

    expect(inspect(copy)).not.toContain(SECRET);
    expect(copy.stack).toBe(`Error: ${copy.message}${framesOf(error)}`);
  });

  it("cuts the stack of another error its message quotes, and the address it called after it", () => {
    const inner = new Error("connect ECONNREFUSED");
    const error = new Error(
      `upstream failed: ${inner.stack}\nwhile calling postgres://app:${SECRET}@db.internal/shop`,
    );

    const copy = redact(error);

    expect(inspect(copy)).not.toContain(SECRET);
    expect(copy.stack).toBe(`Error: ${copy.message}${framesOf(error)}`);
  });

  it("cuts what code wrote past its frames, another error's stack among it", () => {
    const error = new Error("request failed");
    const own = error.stack ?? "";
    error.stack = `${own}\nCaused by: ${new Error(`refused with token=${SECRET}`).stack}`;

    const copy = redact(error);

    expect(inspect(copy)).not.toContain(SECRET);
    expect(copy.stack?.startsWith(`${own}\nCaused by: Error: refused with token=`)).toBe(true);
  });

  it.each([
    ["Node's own, its code in its header", () => decoderError(`token=${SECRET}`)],
    ["a class's, named after super()", () => new Refused(`refused with token=${SECRET}`)],
  ])("keeps every frame of an error's stack as V8 headed it: %s", (_kind, make) => {
    const error = deepError(150, make);
    const frames = error.stack?.slice(error.stack.indexOf("\n    at ")) ?? "";

    const copy = redact(error);

    expect(frames.length).toBeGreaterThan(REDACT_BOUNDS.text);
    expect(inspect(copy)).not.toContain(SECRET);
    expect(copy.stack?.endsWith(frames)).toBe(true);
  });

  it.each([
    ["no message", () => new Error()],
    ["no name", () => Object.assign(new Error(`refused with token=${SECRET}`), { name: "" })],
  ])(
    "keeps every frame of a stack headed as source maps head it, for an error with %s",
    (_kind, make) => {
      const error = deepError(150, () => headedAsSourceMaps(make));
      const frames = error.stack?.slice(error.stack.indexOf("\n    at ")) ?? "";

      const copy = redact(error);

      expect(error.stack).toMatch(/^Error: /);
      expect(frames.length).toBeGreaterThan(REDACT_BOUNDS.text);
      expect(inspect(copy)).not.toContain(SECRET);
      expect(copy.stack?.endsWith(frames)).toBe(true);
    },
  );

  it("gives back an error with nothing to cut as it is, whichever way its stack is headed", () => {
    const errors = [new Error("refused"), new Error(), headedAsSourceMaps(() => new Error())];

    expect(errors.filter((error) => redact(error) !== error)).toEqual([]);
  });

  it.each([
    [
      "set by code",
      (error: Error) => {
        error.stack = `token=${SECRET}\n    at the gate`;
      },
    ],
    [
      "formatted before its message changed",
      (error: Error) => {
        error.message = "refused";
      },
    ],
  ])(
    "cuts its stack whole, as text, where it does not start with its header: %s",
    (_kind, change) => {
      const error = new Error(`refused with token=${SECRET}`);
      void error.stack;
      change(error);

      const copy = redact(error);

      expect(inspect(copy)).not.toContain(SECRET);
    },
  );

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
