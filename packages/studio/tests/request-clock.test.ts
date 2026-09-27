/**
 * A request's clock says what the time ran out on: a host that did not
 * answer, a body it did not finish sending, or a private host the project
 * had not decided on yet. Once the time is up, it admits no host.
 */
import { describe, expect, it } from "vitest";

import type { LookupPolicy } from "../src/server/guarded-lookup";
import { requestClock } from "../src/server/request-clock";
import { SpecFetchError } from "../src/server/spec-fetch-error";
import { SpecHostsUnavailableError } from "../src/server/spec-hosts-unavailable-error";

const SPEC_URL = new URL("https://specs.example.test/openapi.json");
const ADMITS_EVERY: LookupPolicy = { loopback: true, admitPrivate: async () => undefined };

/* A project whose decision on a private host waits until the test makes it. */
function undecided(): { policy: LookupPolicy; admit: () => void; refuse: (error: Error) => void } {
  const decisions: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const policy: LookupPolicy = {
    loopback: false,
    admitPrivate: () => new Promise<void>((resolve, reject) => decisions.push({ resolve, reject })),
  };
  return {
    policy,
    admit: () => {
      for (const { resolve } of decisions) resolve();
    },
    refuse: (error) => {
      for (const { reject } of decisions) reject(error);
    },
  };
}

describe("requestClock", () => {
  it("expires as a host that did not answer while nothing has come back", () => {
    const clock = requestClock(SPEC_URL, ADMITS_EVERY, 300);

    const error = clock.expire();

    expect(error).toBeInstanceOf(SpecFetchError);
    expect(error).toMatchObject({
      code: "SPEC_TIMEOUT",
      refused: false,
      message: "https://specs.example.test/openapi.json did not answer within 300 ms.",
    });
  });

  it("expires as a body the host did not finish sending once it has begun to answer", () => {
    const clock = requestClock(SPEC_URL, ADMITS_EVERY, 60_000);
    clock.answered = true;

    const error = clock.expire();

    expect(error).toMatchObject({
      code: "SPEC_TIMEOUT",
      message: "https://specs.example.test/openapi.json did not send the whole specification within 60 s.",
    });
  });

  it("expires as Studio not able to tell yet while the project decides on a private host", () => {
    const project = undecided();
    const clock = requestClock(SPEC_URL, project.policy, 300);
    void clock.policy.admitPrivate("lan.spec.test (10.0.0.7)");

    const error = clock.expire();

    expect(error).toBeInstanceOf(SpecHostsUnavailableError);
    expect(error).toMatchObject({
      code: "CONFIG_RELOADING",
      message: expect.stringContaining("Blocked request to private address: lan.spec.test (10.0.0.7)."),
    });
  });

  it("refuses a host the project admits after the time ran out, with the error the time ran out with", async () => {
    const project = undecided();
    const clock = requestClock(SPEC_URL, project.policy, 300);
    const admission = clock.policy.admitPrivate("lan.spec.test (10.0.0.7)");

    const error = clock.expire();
    project.admit();

    await expect(admission).rejects.toBe(error);
  });

  it("admits a host the project allows in time, and then expires as a host that did not answer", async () => {
    const project = undecided();
    const clock = requestClock(SPEC_URL, project.policy, 300);
    const admission = clock.policy.admitPrivate("lan.spec.test (10.0.0.7)");

    project.admit();
    await admission;
    const error = clock.expire();

    expect(error).toMatchObject({ code: "SPEC_TIMEOUT", message: "https://specs.example.test/openapi.json did not answer within 300 ms." });
  });

  it("passes the project's refusal on as it is", async () => {
    const project = undecided();
    const clock = requestClock(SPEC_URL, project.policy, 300);
    const admission = clock.policy.admitPrivate("lan.spec.test (10.0.0.7)");
    const refusal = SpecFetchError.privateHost("lan.spec.test (10.0.0.7)");

    project.refuse(refusal);

    await expect(admission).rejects.toBe(refusal);
  });

  it.each([true, false])("keeps loopback %s from the policy it runs under", (loopback) => {
    const clock = requestClock(SPEC_URL, { ...ADMITS_EVERY, loopback }, 300);

    expect(clock.policy.loopback).toBe(loopback);
  });
});
