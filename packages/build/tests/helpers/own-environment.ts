import { vi } from "vitest";

import { withoutSecrets } from "../../src/config/load-error/without-secrets";

/** Variables by name, as a process holds them. */
type Variables = Readonly<Record<string, string | undefined>>;

/**
 * The environment a test of a quoted message relies on: the variables it
 * sets, and of the runner's only those that mask no part of what its code
 * throws. A runner holds values a message may hold too — GitHub's Windows
 * runner sets PGUSER=postgres, so `postgres://` reads `[redacted]://`
 * there — and a test that took the runner's environment as it is would
 * expect what one runner shows. The rest of the runner's are kept, the
 * suite's own settings among them.
 *
 * @param own - The variables the test sets
 * @param thrown - What the test's code throws
 * @returns The environment, for a process the test starts
 * @example
 * ```ts
 * ownEnvironment({ PAYMENTS_TOKEN: "tok_live_4f9c2e7a" }, "token tok_live_4f9c2e7a was refused");
 * // → the runner's variables but those that mask a part of the message, and PAYMENTS_TOKEN
 * ```
 */
export function ownEnvironment(own: Variables, ...thrown: readonly string[]): NodeJS.ProcessEnv {
  const unmasked = thrown.map((text) => withoutSecrets(text, {}));
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [name, value] of Object.entries(process.env)) {
    const masks = thrown.some(
      (text, at) => withoutSecrets(text, { [name]: value }) !== unmasked[at],
    );
    if (masks) delete env[name];
  }
  return Object.assign(env, own);
}

/**
 * Give the test its {@link ownEnvironment} in this process, and so in each
 * process it starts, until `vi.unstubAllEnvs()` gives the runner's back.
 *
 * @param own - The variables the test sets
 * @param thrown - What the test's code throws
 */
export function stubOwnEnvironment(own: Variables, ...thrown: readonly string[]): void {
  const env = ownEnvironment(own, ...thrown);
  for (const name of Object.keys(process.env)) {
    if (!Object.hasOwn(env, name)) vi.stubEnv(name, undefined);
  }
  for (const [name, value] of Object.entries(own)) vi.stubEnv(name, value);
}
