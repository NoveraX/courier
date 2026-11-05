/**
 * A retry policy, attempt by attempt: which failures it sends again, how
 * long it waits before each retry, what a deadline and the retry budget
 * stop, and which writes it repeats. Every attempt is scripted and the
 * clock is a fake one, so each wait is checked to the millisecond.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedEndpointOptions, RetryEvent, RetryOptions } from "../../src/define/options";
import { AbortError, HTTPError, NetworkError, TimeoutError } from "../../src/errors";
import { retryMiddleware, retryPolicy } from "../../src/middleware/retry";
import { type RetryBudget, retryBudget } from "../../src/middleware/retry-budget";
import { endpointRetry } from "../../src/middleware/retry-policies";
import type {
  MiddlewareContext,
  MiddlewareResponse,
  WrapHandler,
} from "../../src/middleware/types";
import { resolveMiddlewareChain } from "../../src/utils/execute-options";

/** One attempt as the rest of the chain ends it. */
type Step = (ctx: MiddlewareContext) => Promise<MiddlewareResponse>;

const ok: Step = () => Promise.resolve({ status: 200, data: { ok: true }, headers: new Headers() });

function answer(status: number, headers: Record<string, string> = {}): Step {
  return () =>
    Promise.reject(new HTTPError({ status, headers: new Headers(headers), data: { status } }));
}

function dropped(systemCode?: string): Step {
  return () => Promise.reject(new NetworkError({ systemCode }));
}

const timedOut: Step = () => Promise.reject(new TimeoutError({ scope: "attempt", timeout: 100 }));

/* An attempt the upstream never answers: it ends when the call's signal aborts, as fetch does. */
const hung: Step = (ctx) =>
  new Promise((_resolve, reject) => {
    ctx.signal?.addEventListener("abort", () => reject(ctx.signal?.reason), { once: true });
  });

function contextFor(fields: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return { source: "api", method: "read", headers: new Headers(), kind: "query", ...fields };
}

interface Outcome {
  readonly response?: MiddlewareResponse;
  readonly error?: unknown;
  /** When each attempt was sent, in ms from the call's start. */
  readonly sentAt: readonly number[];
  readonly retries: readonly RetryEvent[];
}

/**
 * Make a call through a policy, the script's last step repeated once it runs out,
 * and run the clock until it is over.
 */
async function call(
  options: RetryOptions,
  steps: readonly Step[],
  ctx: MiddlewareContext = contextFor(),
  budget: RetryBudget = retryBudget(),
  onRetry: () => unknown = () => {},
): Promise<Outcome> {
  const retries: RetryEvent[] = [];
  const sentAt: number[] = [];
  const started = Date.now();
  const told = (retry: RetryEvent) => {
    retries.push(retry);
    return onRetry();
  };
  const policy = retryPolicy({ ...options, onRetry: told }, budget);
  const next = () => {
    sentAt.push(Date.now() - started);
    return (steps[Math.min(sentAt.length - 1, steps.length - 1)] as Step)(ctx);
  };
  const settled = (policy.handler as WrapHandler)(ctx, next).then(
    (response) => ({ response }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return { ...(await settled), sentAt, retries };
}

const waitsOf = (outcome: Outcome): number[] => outcome.retries.map((retry) => retry.delay);

/** An endpoint's options, as the definition resolves them, with a retry policy. */
function endpointWith(retry: RetryOptions): ResolvedEndpointOptions {
  return { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true, retry };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.setSystemTime(new Date("2026-03-02T09:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("what a policy retries where retryOn says nothing", () => {
  it.each([408, 425, 429, 500, 502, 503, 504])("retries a %i answer", async (status) => {
    const outcome = await call({ delay: 1 }, [answer(status), ok]);

    expect(outcome.response).toMatchObject({ status: 200 });
    expect(outcome.sentAt).toHaveLength(2);
  });

  it.each([400, 401, 403, 404, 409, 422, 501, 505])(
    "does not retry a %i answer",
    async (status) => {
      const outcome = await call({ delay: 1 }, [answer(status), ok]);

      expect(outcome.error).toMatchObject({ status });
      expect(outcome.sentAt).toHaveLength(1);
    },
  );

  it.each([undefined, "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_SOCKET"])(
    "retries a request that got no answer, the platform naming it %s",
    async (code) => {
      const outcome = await call({ delay: 1 }, [dropped(code), ok]);

      expect(outcome.response).toMatchObject({ status: 200 });
      expect(outcome.sentAt).toHaveLength(2);
    },
  );

  it.each(["CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"])(
    "does not retry a certificate the platform refused as %s",
    async (code) => {
      const outcome = await call({ delay: 1 }, [dropped(code), ok]);

      expect(outcome.error).toBeInstanceOf(NetworkError);
      expect(outcome.sentAt).toHaveLength(1);
    },
  );

  it("does not retry a request whose own time ran out: a slow upstream would only be slower", async () => {
    const outcome = await call({ delay: 1 }, [timedOut, ok]);

    expect(outcome.error).toMatchObject({ name: "TimeoutError", scope: "attempt" });
    expect(outcome.sentAt).toHaveLength(1);
  });

  it("retries a request whose time ran out when retryOn names timeouts", async () => {
    const outcome = await call({ delay: 1, retryOn: ["timeout"] }, [timedOut, ok]);

    expect(outcome.response).toMatchObject({ status: 200 });
    expect(outcome.retries[0]?.failure).toEqual({
      kind: "timeout",
      error: expect.any(TimeoutError),
    });
  });

  it("retries an answer a middleware further in returned rather than threw", async () => {
    const unavailable: Step = () =>
      Promise.resolve({ status: 503, data: undefined, headers: new Headers() });

    const outcome = await call({ limit: 1, delay: 1 }, [unavailable]);

    expect(outcome.response).toMatchObject({ status: 503 });
    expect(outcome.sentAt).toHaveLength(2);
  });

  it("never retries what no retry mends, whatever retryOn says", async () => {
    const steps: Step[] = [
      () => Promise.reject(new Error("a middleware threw")),
      () => Promise.reject(new TimeoutError({ scope: "deadline", timeout: 1_000 })),
    ];
    for (const step of steps) {
      const outcome = await call({ delay: 1, retryOn: () => true }, [step, ok]);

      expect(outcome.sentAt).toHaveLength(1);
    }
  });

  it("does not retry a call a newer one superseded, whatever retryOn says", async () => {
    const superseded: Step = () => Promise.reject(new AbortError({ code: "SUPERSEDED" }));

    const outcome = await call({ delay: 1, retryOn: () => true }, [superseded, ok]);

    expect(outcome.error).toMatchObject({ name: "AbortError", code: "SUPERSEDED" });
    expect(outcome.sentAt).toHaveLength(1);
  });

  it("takes an upstream's own 499 for an answer like any other, retried where retryOn names it", async () => {
    const outcome = await call({ delay: 1, retryOn: [499] }, [answer(499), ok]);

    expect(outcome.response).toMatchObject({ status: 200 });
    expect(outcome.sentAt).toHaveLength(2);
  });

  it("makes no more than limit retries", async () => {
    const outcome = await call({ limit: 2, delay: 1 }, [answer(503)]);

    expect(outcome.error).toMatchObject({ status: 503 });
    expect(outcome.sentAt).toHaveLength(3);
    expect(outcome.retries.map((retry) => retry.attempt)).toEqual([2, 3]);
  });
});

describe("the wait before each retry", () => {
  it("is a random time up to a delay that doubles with each retry", async () => {
    const said = [0.5, 0.25, 0.999];
    const random = () => said.shift() ?? 0;

    const outcome = await call({ delay: 100, random }, [answer(503)]);

    expect(waitsOf(outcome)).toEqual([50, 50, 399]);
    expect(outcome.sentAt).toEqual([0, 50, 100, 499]);
  });

  it("is the delay itself without jitter", async () => {
    const outcome = await call({ delay: 100, jitter: "none" }, [answer(503)]);

    expect(waitsOf(outcome)).toEqual([100, 200, 400]);
    expect(outcome.sentAt).toEqual([0, 100, 300, 700]);
  });

  it("is never longer than maxDelay", async () => {
    const outcome = await call({ limit: 4, delay: 100, maxDelay: 250, jitter: "none" }, [
      answer(503),
    ]);

    expect(waitsOf(outcome)).toEqual([100, 200, 250, 250]);
  });

  it("stays the delay with a fixed backoff", async () => {
    const outcome = await call({ delay: 100, backoff: "fixed", jitter: "none" }, [answer(503)]);

    expect(waitsOf(outcome)).toEqual([100, 100, 100]);
  });

  it("starts at 300 ms and stops growing at 20 s by default", async () => {
    const outcome = await call({ limit: 10, jitter: "none" }, [answer(503)]);

    expect(waitsOf(outcome)).toEqual([
      300, 600, 1_200, 2_400, 4_800, 9_600, 19_200, 20_000, 20_000, 20_000,
    ]);
  });

  it("is what an answer's Retry-After asks in seconds, whatever the backoff", async () => {
    const outcome = await call({ delay: 100 }, [answer(503, { "retry-after": "2" }), ok]);

    expect(waitsOf(outcome)).toEqual([2_000]);
    expect(outcome.sentAt).toEqual([0, 2_000]);
  });

  it("is what an answer's Retry-After asks as a date", async () => {
    const at = new Date(Date.now() + 3_000).toUTCString();

    const outcome = await call({ delay: 100 }, [answer(429, { "retry-after": at }), ok]);

    expect(waitsOf(outcome)).toEqual([3_000]);
  });

  it("is none for a Retry-After date already past", async () => {
    const at = new Date(Date.now() - 60_000).toUTCString();

    const outcome = await call({ delay: 100 }, [answer(503, { "retry-after": at }), ok]);

    expect(waitsOf(outcome)).toEqual([0]);
  });

  it("is the backoff where Retry-After says neither seconds nor a date", async () => {
    const outcome = await call({ delay: 100, jitter: "none" }, [
      answer(503, { "retry-after": "soon" }),
      ok,
    ]);

    expect(waitsOf(outcome)).toEqual([100]);
  });

  it("is not waited when Retry-After asks for longer than maxDelay: the call fails at once", async () => {
    const outcome = await call({ maxDelay: 10_000 }, [answer(503, { "retry-after": "11" }), ok]);

    expect(outcome.error).toMatchObject({ status: 503 });
    expect(outcome.sentAt).toHaveLength(1);
    expect(outcome.retries).toEqual([]);
  });
});

describe("a deadline", () => {
  it("starts no wait that would end past it", async () => {
    const outcome = await call({ delay: 100, jitter: "none", deadline: 500 }, [answer(503)]);

    /* The third wait, 400 ms from 300 ms in, would end past 500 ms. */
    expect(outcome.error).toMatchObject({ status: 503 });
    expect(outcome.sentAt).toEqual([0, 100, 300]);
  });

  it("stops an attempt it overtakes with a TimeoutError of its own scope", async () => {
    const outcome = await call({ deadline: 1_000, retryOn: () => true }, [hung]);

    expect(outcome.error).toBeInstanceOf(TimeoutError);
    expect(outcome.error).toMatchObject({ scope: "deadline", timeout: 1_000 });
    expect(outcome.sentAt).toEqual([0]);
    expect(Date.now() - new Date("2026-03-02T09:00:00.000Z").getTime()).toBe(1_000);
  });

  it("bounds the attempts together, not each one", async () => {
    const outcome = await call({ delay: 100, jitter: "none", deadline: 1_000 }, [
      answer(503),
      hung,
    ]);

    expect(outcome.error).toMatchObject({ scope: "deadline" });
    expect(outcome.sentAt).toEqual([0, 100]);
  });

  it("lets the caller's own cancellation through, an AbortError with the reason it was given", async () => {
    const controller = new AbortController();
    const reason = new Error("navigated away");
    setTimeout(() => controller.abort(reason), 200);

    const outcome = await call(
      { deadline: 1_000 },
      [hung],
      contextFor({ signal: controller.signal }),
    );

    expect(outcome.error).toBeInstanceOf(AbortError);
    expect(outcome.error).toMatchObject({ code: "ABORTED", cause: reason });
  });

  it("leaves the call's signal as it found it, and no timer behind", async () => {
    const controller = new AbortController();
    const ctx = contextFor({ signal: controller.signal });

    await call({ deadline: 1_000 }, [answer(503), ok], ctx);

    expect(ctx.signal).toBe(controller.signal);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the retry budget", () => {
  /* 500 to spend, 5 for a retry: a hundred retries before the upstream has to answer again. */
  async function drain(budget: RetryBudget): Promise<void> {
    for (let spent = 0; spent < 10; spent++) {
      await call({ limit: 10, delay: 1 }, [answer(503)], contextFor(), budget);
    }
  }

  it("stops a policy's retries once its calls have spent it", async () => {
    const budget = retryBudget();
    await drain(budget);

    const outcome = await call({ limit: 10, delay: 1 }, [answer(503)], contextFor(), budget);

    expect(outcome.error).toMatchObject({ status: 503 });
    expect(outcome.sentAt).toHaveLength(1);
  });

  it("spends twice as much on a timeout, which kept the upstream waiting longest", async () => {
    const budget = retryBudget();
    const retried = { limit: 10, delay: 1, retryOn: ["timeout"] } as const;
    for (let spent = 0; spent < 5; spent++) await call(retried, [timedOut], contextFor(), budget);

    const outcome = await call(retried, [timedOut], contextFor(), budget);

    expect(outcome.sentAt).toHaveLength(1);
  });

  it("fills again as calls are answered, a retried one giving back what it spent", async () => {
    const budget = retryBudget();
    await drain(budget);

    /* Five answers needing no retry give back one retry's worth… */
    for (let answered = 0; answered < 5; answered++) {
      await call({ delay: 1 }, [ok], contextFor(), budget);
    }
    /* …which a call spends and, answered, gives back… */
    const recovered = await call({ delay: 1 }, [answer(503), ok], contextFor(), budget);
    /* …so the next call may retry once again, and only once. */
    const next = await call({ limit: 10, delay: 1 }, [answer(503)], contextFor(), budget);

    expect(recovered.response).toMatchObject({ status: 200 });
    expect(next.sentAt).toHaveLength(2);
  });

  it("is shared by an API's endpoints, whose policies are each made once", () => {
    const api = {};
    const other = {};
    const options: RetryOptions = { limit: 2 };

    const first = endpointRetry(api, options);

    expect(endpointRetry(api, options)).toBe(first);
    expect(endpointRetry(other, options)).not.toBe(first);
  });

  it("is spent by one endpoint for the others of its API", async () => {
    const api = {};
    const policyOf = (options: RetryOptions): WrapHandler => {
      const [policy] = resolveMiddlewareChain(api, undefined, endpointWith(options));
      if (policy?.phase !== "wrap") throw new Error("no retry policy in the chain");
      return policy.handler;
    };
    const readMany = policyOf({ limit: 10, delay: 1 });
    const readOne = policyOf({ limit: 10, delay: 1 });
    let sent = 0;
    const failing = () => {
      sent++;
      return answer(503)(contextFor());
    };
    const failOn = async (handler: WrapHandler): Promise<void> => {
      const settled = handler(contextFor(), failing).catch(() => {});
      await vi.runAllTimersAsync();
      await settled;
    };
    for (let spent = 0; spent < 10; spent++) await failOn(readMany);
    sent = 0;

    await failOn(readOne);

    expect(sent).toBe(1);
  });
});

describe("a write", () => {
  const write = () => contextFor({ kind: "mutation" });

  it("is sent once by default: one whose answer was lost may have been carried out", async () => {
    const outcome = await call({ delay: 1 }, [answer(503), ok], write());

    expect(outcome.error).toMatchObject({ status: 503 });
    expect(outcome.sentAt).toHaveLength(1);
  });

  it.each([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "UND_ERR_CONNECT_TIMEOUT",
  ])("is sent again when it certainly never left, failing with %s", async (code) => {
    const outcome = await call({ delay: 1 }, [dropped(code), ok], write());

    expect(outcome.response).toMatchObject({ status: 200 });
    expect(outcome.sentAt).toHaveLength(2);
  });

  it.each([undefined, "ECONNRESET", "UND_ERR_SOCKET"])(
    "is sent once when it may have reached the upstream, failing with %s",
    async (code) => {
      const outcome = await call({ delay: 1 }, [dropped(code), ok], write());

      expect(outcome.error).toBeInstanceOf(NetworkError);
      expect(outcome.sentAt).toHaveLength(1);
    },
  );

  it("is never sent again with mutations: false, not even one that never left", async () => {
    const outcome = await call(
      { delay: 1, mutations: false },
      [dropped("ECONNREFUSED"), ok],
      write(),
    );

    expect(outcome.sentAt).toHaveLength(1);
  });

  it("is sent again when it carries an idempotency key", async () => {
    const ctx = contextFor({ kind: "mutation", idempotencyKey: "order-7f3a" });

    const outcome = await call({ delay: 1 }, [answer(503), ok], ctx);

    expect(outcome.sentAt).toHaveLength(2);
  });

  it("is sent again with mutations: true", async () => {
    const outcome = await call({ delay: 1, mutations: true }, [answer(503), ok], write());

    expect(outcome.sentAt).toHaveLength(2);
  });

  it("is a read when nothing says it writes", async () => {
    const outcome = await call({ delay: 1 }, [answer(503), ok], contextFor({ kind: undefined }));

    expect(outcome.sentAt).toHaveLength(2);
  });

  it("is sent once when its body is a stream, which cannot be sent twice", async () => {
    const ctx = contextFor({ variables: new ReadableStream(), kind: "query" });

    const outcome = await call({ delay: 1 }, [answer(503), ok], ctx);

    expect(outcome.sentAt).toHaveLength(1);
  });
});

describe("onRetry", () => {
  it("is told of each retry before its wait: the attempt, the wait and why", async () => {
    const told: { event: RetryEvent; ctx: MiddlewareContext; at: number }[] = [];
    const ctx = contextFor();
    const started = Date.now();
    const policy = retryMiddleware({
      delay: 100,
      jitter: "none",
      onRetry: (event, context) => told.push({ event, ctx: context, at: Date.now() - started }),
    });

    const settled = (policy.handler as WrapHandler)(ctx, () => answer(503)(ctx)).catch(() => {});
    await vi.runAllTimersAsync();
    await settled;

    expect(told.map(({ event, at }) => [event.attempt, event.delay, at])).toEqual([
      [2, 100, 0],
      [3, 200, 100],
      [4, 400, 300],
    ]);
    expect(told[0]?.ctx).toBe(ctx);
    expect(told[0]?.event.failure).toMatchObject({ kind: "status", status: 503 });
  });

  it("is waited for when it returns a promise, the retry's wait starting after it", async () => {
    const recorded = (ms: number) => () => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const outcome = await call(
      { delay: 100, jitter: "none" },
      [answer(503), ok],
      contextFor(),
      retryBudget(),
      recorded(40),
    );

    expect(outcome.sentAt).toEqual([0, 140]);
  });

  it("fails the call with the error it throws or rejects with, as no unhandled rejection", async () => {
    const lost = new Error("the log is down");

    for (const onRetry of [
      () => Promise.reject(lost),
      () => {
        throw lost;
      },
    ]) {
      const outcome = await call(
        { delay: 1 },
        [answer(503), ok],
        contextFor(),
        retryBudget(),
        onRetry,
      );

      expect(outcome.error).toBe(lost);
      expect(outcome.sentAt).toHaveLength(1);
    }
  });

  it("is waited for no longer than the deadline, its promise left to settle on its own", async () => {
    const late = () =>
      new Promise((_resolve, reject) => setTimeout(reject, 1_000, new Error("late")));
    let ended: unknown = "waiting on onRetry";
    const policy = retryPolicy({ delay: 1, deadline: 100, onRetry: late }, retryBudget());
    const ctx = contextFor();

    void (policy.handler as WrapHandler)(ctx, () => dropped()(ctx)).catch((error: unknown) => {
      ended = error;
    });
    await vi.runAllTimersAsync();

    expect(ended).toBeInstanceOf(TimeoutError);
    expect(ended).toMatchObject({ scope: "deadline", timeout: 100 });
  });

  it("is waited for no longer than the caller waits, the call rejecting with an AbortError", async () => {
    const controller = new AbortController();
    const onRetry = vi.fn(() => new Promise(() => {}));
    let ended: unknown = "waiting on onRetry";
    const policy = retryPolicy({ delay: 1, onRetry }, retryBudget());
    const ctx = contextFor({ signal: controller.signal });

    void (policy.handler as WrapHandler)(ctx, () => dropped()(ctx)).catch((error: unknown) => {
      ended = error;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(onRetry).toHaveBeenCalledOnce();
    controller.abort();
    await vi.advanceTimersByTimeAsync(10);

    expect(ended).toBeInstanceOf(AbortError);
  });
});

describe("a cancellation", () => {
  it("ends a wait between attempts at once, with the caller's reason", async () => {
    const controller = new AbortController();
    const failOnce: Step = () => {
      setTimeout(() => controller.abort(), 50);
      return answer(503)(contextFor());
    };

    const outcome = await call(
      { delay: 10_000, jitter: "none" },
      [failOnce, ok],
      contextFor({ signal: controller.signal }),
    );

    expect(outcome.error).toMatchObject({ name: "AbortError" });
    expect(outcome.sentAt).toEqual([0]);
    expect(Date.now() - new Date("2026-03-02T09:00:00.000Z").getTime()).toBe(50);
  });

  it("is never retried, whatever the attempt was rejected with", async () => {
    const controller = new AbortController();
    const cancelled: Step = () => {
      controller.abort();
      return answer(503)(contextFor());
    };

    const outcome = await call(
      { delay: 1 },
      [cancelled, ok],
      contextFor({ signal: controller.signal }),
    );

    expect(outcome.error).toMatchObject({ name: "AbortError" });
    expect(outcome.sentAt).toHaveLength(1);
  });
});

describe("a policy's options", () => {
  it.each<[string, Record<string, unknown>]>([
    ["a limit past ten", { limit: 11 }],
    ["a negative limit", { limit: -1 }],
    ["a fractional limit", { limit: 1.5 }],
    ["a delay that is no number", { delay: "300" }],
    ["a negative delay", { delay: -1 }],
    ["an endless delay", { delay: Number.POSITIVE_INFINITY }],
    ["a maxDelay that is NaN", { maxDelay: Number.NaN }],
    ["a delay longer than a timer keeps", { delay: 2 ** 31 }],
    ["a maxDelay longer than a timer keeps", { maxDelay: 2 ** 31 }],
    ["a deadline longer than a timer keeps", { deadline: 2 ** 31 }],
    ["a deadline of nothing", { deadline: 0 }],
    ["a backoff it has not", { backoff: "linear" }],
    ["a jitter it has not", { jitter: "half" }],
    ["a status past 599", { retryOn: [600] }],
    ["a status before 100", { retryOn: [99] }],
    ["a cause it has not", { retryOn: ["dns"] }],
    ["one trigger where a list goes", { retryOn: "network" }],
    ["a mutations that is no boolean", { mutations: "yes" }],
    ["an onRetry that is no function", { onRetry: "log" }],
    ["a random that is no function", { random: 0.5 }],
    ["an option it does not have", { attempts: 3 }],
    ["a name every object inherits", { toString: () => "" }],
  ])("refuses %s where the policy is written", (_name, options) => {
    expect(() => retryMiddleware(options as RetryOptions)).toThrow(
      expect.objectContaining({ name: "ConfigurationError", code: "RETRY_OPTIONS_INVALID" }),
    );
  });

  it("names what is wrong", () => {
    expect(() => retryMiddleware({ limit: 11 })).toThrow("A retry policy's limit cannot be 11");
    expect(() => retryMiddleware({ attempts: 3 } as RetryOptions)).toThrow(
      'A retry policy has no option "attempts"',
    );
  });

  it("takes every option at its bounds", () => {
    expect(() =>
      retryMiddleware({
        limit: 10,
        delay: 0,
        maxDelay: 0,
        deadline: 1,
        backoff: "fixed",
        jitter: "none",
        retryOn: ["network", "timeout", 100, 599],
        mutations: false,
        onRetry: () => {},
        random: () => 0,
      }),
    ).not.toThrow();
    expect(() => retryMiddleware({ limit: 0, retryOn: undefined })).not.toThrow();
    const longest = 2 ** 31 - 1;
    expect(() =>
      retryMiddleware({ delay: longest, maxDelay: longest, deadline: longest }),
    ).not.toThrow();
  });

  it("keeps a call for as long as the longest deadline it takes, on a real clock", async () => {
    /* Past 2 ** 31 - 1 ms, setTimeout fires at once: such a deadline would end every call. */
    vi.useRealTimers();
    const policy = retryMiddleware({ deadline: 2 ** 31 - 1 });
    const slow = () =>
      new Promise<MiddlewareResponse>((resolve) =>
        setTimeout(() => resolve({ status: 200, data: undefined, headers: new Headers() }), 20),
      );

    await expect((policy.handler as WrapHandler)(contextFor(), slow)).resolves.toMatchObject({
      status: 200,
    });
  });
});

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

describe("a policy over any script of failures", () => {
  const STATUSES = [400, 404, 408, 425, 429, 500, 501, 502, 503, 504];
  const CODES = [undefined, "ECONNRESET", "ECONNREFUSED", "CERT_HAS_EXPIRED"];

  it("keeps its limit, its cap, its deadline and its writes", async () => {
    const pick = generator(0x5eed_b2);
    const choose = <T>(items: readonly T[]): T => items[Math.floor(pick() * items.length)] as T;

    for (let run = 0; run < 300; run++) {
      const options: RetryOptions = {
        limit: Math.floor(pick() * 11),
        delay: Math.floor(pick() * 500),
        maxDelay: Math.floor(pick() * 5_000),
        backoff: choose(["fixed", "exponential"] as const),
        jitter: choose(["full", "none"] as const),
        deadline: pick() < 0.5 ? undefined : 1 + Math.floor(pick() * 10_000),
        random: generator(run),
      };
      const kind = choose(["query", "mutation"] as const);
      const steps: Step[] = Array.from({ length: 12 }, () => {
        const roll = pick();
        if (roll < 0.15) return ok;
        if (roll < 0.3) return dropped(choose(CODES));
        if (roll < 0.4) return timedOut;
        const retryAfter = pick() < 0.2 ? { "retry-after": String(Math.floor(pick() * 8)) } : {};
        return answer(choose(STATUSES), retryAfter);
      });

      const outcome = await call(options, steps, contextFor({ kind }));
      const said = `run ${run}: ${JSON.stringify({ ...options, random: undefined, kind })}`;
      const waits = waitsOf(outcome);

      expect(outcome.sentAt.length, said).toBeLessThanOrEqual((options.limit ?? 3) + 1);
      expect(outcome.retries.length, said).toBe(outcome.sentAt.length - 1);
      for (const wait of waits) {
        expect(wait, said).toBeGreaterThanOrEqual(0);
        expect(wait, said).toBeLessThanOrEqual(options.maxDelay ?? 20_000);
      }
      if (options.deadline !== undefined) {
        expect(outcome.sentAt.at(-1) ?? 0, said).toBeLessThan(options.deadline);
      }
      for (const retry of outcome.retries) {
        expect(retry.failure.kind, said).not.toBe("timeout");
        if (retry.failure.kind === "status") {
          expect([408, 425, 429, 500, 502, 503, 504], said).toContain(retry.failure.status);
        } else if (retry.failure.kind === "network") {
          expect(retry.failure.error.systemCode, said).not.toBe("CERT_HAS_EXPIRED");
        }
        /* A write is sent again only when it never left. */
        if (kind === "mutation") {
          const code =
            retry.failure.kind === "network" ? retry.failure.error.systemCode : undefined;
          expect(code, said).toBe("ECONNREFUSED");
        }
      }
    }
  });
});
