import { get } from "node:http";

/* How long one request may go without an answer. */
const ATTEMPT_TIMEOUT_MS = 10_000;

/* Why a request got no answer: each address it tried, for a name that has several. */
function failureOf(error: NodeJS.ErrnoException): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map((each: NodeJS.ErrnoException) => failureOf(each)).join(", ");
  }
  const { code, message } = error;
  return code === undefined || message.includes(code) ? message : `${code}: ${message}`;
}

/*
 * node:http, not fetch: the fetch Node 24.21 ships marks each socket it
 * writes on, and on macOS a socket the server is closing refuses the mark
 * with an error no promise of fetch's catches (setTypeOfService EINVAL) —
 * which ended the check while a dev server restarted.
 */
function attempt(url: string): Promise<number | string> {
  return new Promise((done) => {
    const request = get(url, (response) => {
      response.resume();
      done(response.statusCode ?? 0);
    });
    request.setTimeout(ATTEMPT_TIMEOUT_MS, () =>
      request.destroy(new Error(`no answer within ${ATTEMPT_TIMEOUT_MS / 1000} s`)),
    );
    request.on("error", (error) => done(failureOf(error)));
  });
}

/**
 * Ask an address until it answers 200, or the time runs out.
 *
 * @param url - The address
 * @param within - How long to keep asking, in milliseconds
 * @returns `true` once it answered 200; otherwise what the last request
 *   got — the status, or why it got none — for the error to name
 * @example
 * ```ts
 * await answers("http://127.0.0.1:7101/users", 120_000); // true, or "ECONNREFUSED connect ECONNREFUSED 127.0.0.1:7101"
 * ```
 */
export async function answers(url: string, within: number): Promise<true | string> {
  const until = Date.now() + within;
  let last = "no request was made";
  while (Date.now() < until) {
    const got = await attempt(url);
    if (got === 200) return true;
    last = typeof got === "number" ? `it answered ${got}` : got;
    await new Promise((done) => setTimeout(done, 1_000));
  }
  return last;
}

/**
 * Whether an address answers again a moment after it first did: a dev
 * server may restart once just after it starts — fastify-cli's, as its
 * compiler catches up.
 *
 * @param url - The address
 * @returns `true` when it answered 200 within a minute; otherwise what the
 *   last request got
 * @example
 * ```ts
 * await settled("http://localhost:4321/courier");
 * ```
 */
export async function settled(url: string): Promise<true | string> {
  await new Promise((done) => setTimeout(done, 5_000));
  return answers(url, 60_000);
}
