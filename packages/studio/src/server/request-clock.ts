import { formatDuration } from "./format-duration";
import type { LookupPolicy } from "./guarded-lookup";
import { SpecFetchError } from "./spec-fetch-error";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";

/** The clock one request for a specification runs on, and what it was waiting for. */
export interface RequestClock {
  /** The policy the request runs under. */
  readonly policy: LookupPolicy;
  /** Whether the server has begun to answer: time that runs out from then runs out on the body. */
  answered: boolean;
  /** The time is up: the error the request fails with. */
  expire(): Error;
}

/**
 * The clock for one request: it knows whether the request waits for a
 * private host to be admitted when the time runs out, and admits none after,
 * and whether the server had begun to answer.
 *
 * Time that runs out while a host is being admitted has reached no host, and
 * Studio cannot tell yet whether the project allows it, so the request fails
 * with `CONFIG_RELOADING`. Otherwise it fails with `SPEC_TIMEOUT`, saying
 * whether the host did not answer or did not finish sending the body.
 *
 * @param url - The URL requested, for messages
 * @param policy - What besides the public internet the request may reach
 * @param timeoutMs - How long the request may take, all of it
 * @returns The clock, whose policy the request must connect under
 *
 * @example
 * ```ts
 * const clock = requestClock(url, policy, 30_000);
 * setTimeout(() => request.destroy(clock.expire()), 30_000);
 * ```
 */
export function requestClock(url: URL, policy: LookupPolicy, timeoutMs: number): RequestClock {
  let admitting: string | undefined;
  let expired: Error | undefined;
  const clock: RequestClock = {
    answered: false,
    policy: {
      loopback: policy.loopback,
      admitPrivate: async (what) => {
        admitting = what;
        try {
          await policy.admitPrivate(what);
        } finally {
          admitting = undefined;
        }
        if (expired) throw expired;
      },
    },
    expire() {
      expired =
        admitting === undefined
          ? timedOut(url, timeoutMs, clock.answered)
          : SpecHostsUnavailableError.reloading(admitting);
      return expired;
    },
  };
  return clock;
}

function timedOut(url: URL, timeoutMs: number, answered: boolean): SpecFetchError {
  const missing = answered ? "did not send the whole specification" : "did not answer";
  return new SpecFetchError(
    "SPEC_TIMEOUT",
    `${url.href} ${missing} within ${formatDuration(timeoutMs)}.`,
    { url: url.href },
  );
}
